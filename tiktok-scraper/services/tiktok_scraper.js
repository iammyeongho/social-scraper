const config = require('../config').tiktok;
const TikTokProfileScraper = require('../scrapers/tiktok_profile_scraper');
const TikTokPostScraper = require('../scrapers/tiktok_post_scraper');
const TikTokFollowerScraper = require('../scrapers/tiktok_follower_scraper');
const TikTokCommentScraper = require('../scrapers/tiktok_comment_scraper');
const PerformanceTracker = require('./performance_tracker');

/**
 * TikTok 인플루언서 스크래핑 메인 서비스
 */
class TikTokScraper {
	constructor() {
		this.influencerQueue = [];
		this.isProcessing = false;
		this.results = [];
		this.profileScraper = null;
		this.postScraper = null;
		this.followerScraper = null;
		this.commentScraper = null;
		this.performanceTracker = new PerformanceTracker();
		this.currentSessionId = null;
	}

	/**
	 * 스크래퍼 초기화
	 */
	async initializeScrapers() {
		// 성능 추적기 초기화 (한 번만)
		if (!this.performanceTracker.currentSessionId) {
			await this.performanceTracker.initialize();
			this.currentSessionId = await this.performanceTracker.startSession(`TikTok_MainScraping_${Date.now()}`);
		}
		
		if (!this.profileScraper) {
			this.profileScraper = new TikTokProfileScraper();
			await this.profileScraper.initialize();
		}
		
		if (!this.postScraper) {
			this.postScraper = new TikTokPostScraper();
			await this.postScraper.initialize();
		}
		
		if (!this.followerScraper) {
			this.followerScraper = new TikTokFollowerScraper();
			await this.followerScraper.initialize();
		}
		
		if (!this.commentScraper) {
			this.commentScraper = new TikTokCommentScraper();
			await this.commentScraper.initialize();
		}
	}

	/**
	 * 서드파티 API에서 받은 인플루언서 ID 목록을 큐에 추가
	 * @param {Array} influencerIds - API에서 받은 인플루언서 ID 배열
	 */
	addInfluencersToQueue(influencerIds) {
		this.influencerQueue.push(...influencerIds);
		console.log(`큐에 ${influencerIds.length}개의 TikTok 인플루언서 ID가 추가되었습니다.`);
		console.log(`현재 큐 크기: ${this.influencerQueue.length}`);
	}

	/**
	 * 큐에서 인플루언서 ID를 가져와서 스크래핑 실행 (스트림 처리 방식)
	 */
	async processNextInfluencer() {
		if (this.influencerQueue.length === 0) {
			console.log('처리할 TikTok 인플루언서가 없습니다.');
			return null;
		}

		const apiInfluencerId = this.influencerQueue.shift();
		console.log(`\n=== TikTok 인플루언서 스크래핑 시작: ${apiInfluencerId} ===`);
		
		let profileId = null;
		let savedPostsCount = 0;
		let totalPostsCount = 0;
		
		try {
			// 1. 인플루언서 프로필 정보 수집
			const profileData = await this.scrapeInfluencerProfile(apiInfluencerId);
			
			if (!profileData) {
				console.log(`TikTok 프로필 정보 수집 실패: ${apiInfluencerId}`);
				return null;
			}

			// 2. 프로필 먼저 즉시 저장 (데이터베이스 서비스 필요)
			if (!this.databaseService) {
				// 데이터베이스 서비스 주입이 필요함 - 나중에 해결
				console.log('데이터베이스 서비스가 없어 기존 방식으로 처리');
				return await this.processInfluencerLegacy(apiInfluencerId, profileData);
			}

			console.log(`프로필 즉시 저장 중: @${apiInfluencerId}`);
			profileId = await this.databaseService.saveProfile(profileData);
			console.log(`프로필 저장 완료: profileId=${profileId}`);

			// 3. 게시물 URL 목록 수집
			const postUrls = profileData.post_urls || [];
			const postData = profileData.post_data || [];
			totalPostsCount = postData.length;
			
			if (postUrls.length === 0) {
				console.log(`TikTok 게시물 URL 수집 실패: ${apiInfluencerId}`);
				return { 
					profile: profileData, 
					posts: [], 
					profileId: profileId,
					savedPosts: 0,
					totalPosts: 0
				};
			}

			console.log(`프로필에서 수집된 게시물: ${postData.length}개 (URL: ${postUrls.length}개)`);

			// 4. 게시물 하나씩 처리 + 즉시 저장
			console.log(`게시물 하나씩 스크래핑 + 즉시 저장 시작...`);
			
			for (let i = 0; i < postData.length; i++) {
				const post = postData[i];
				
				try {
					console.log(`게시물 ${i + 1}/${postData.length} 처리 중: ${post.url}`);
					
					// 게시물 데이터 변환
					const postRecord = await this.convertSinglePostToDbFormat(post, profileData.username);
					
					// 즉시 저장
					await this.databaseService.savePost(profileId, postRecord);
					savedPostsCount++;
					
					console.log(` 저장 완료 (${savedPostsCount}/${totalPostsCount}): 조회수 ${postRecord.plays?.toLocaleString()}`);
					
					// 짧은 딜레이
					await this.delay(100);
				} catch (error) {
					console.error(`게시물 저장 실패 (${i + 1}/${postData.length}): ${post.url}`, error.message);
					// 에러가 나도 계속 진행
				}
			}
			
			console.log(`게시물 저장 완료: ${savedPostsCount}/${totalPostsCount}개`);

			// 5. 팔로워 정보 수집 (설정에 따라)
			let followersData = { username: apiInfluencerId, followers: [], total_collected: 0 };
			if (config.scraping.enableFollowerScraping && this.databaseService) {
				console.log(`\n👥 팔로워 수집 + 즉시 저장 시작: @${apiInfluencerId}`);
				followersData = await this.scrapeAndSaveFollowers(apiInfluencerId, profileId);
			} else {
				console.log(`팔로워 수집 건너뛰기 (설정에 의해 비활성화)`);
			}

			// 6. 게시물 상세 정보 수집 + 즉시 업데이트 (설정에 따라)
			let detailedPostsCount = 0;
			if (config.scraping.enablePostDetailScraping && this.databaseService) {
				console.log(`\n게시물 상세 정보 수집 + 즉시 업데이트 시작...`);
				const maxDetailedPosts = config.scraping.maxDetailedPosts || 5;
				detailedPostsCount = await this.scrapeAndUpdatePostDetails(postUrls.slice(0, maxDetailedPosts), profileId);
			} else {
				console.log(`게시물 상세 정보 수집 건너뛰기 (설정에 의해 비활성화)`);
			}

			// 7. 댓글 정보 수집 + 즉시 저장 (설정에 따라)
			let savedCommentsCount = 0;
			if (config.scraping.enableCommentScraping && this.databaseService) {
				console.log(`\n댓글 수집 + 즉시 저장 시작...`);
				const maxCommentPosts = config.scraping.maxCommentPosts || 3;
				savedCommentsCount = await this.scrapeAndSaveComments(postUrls.slice(0, maxCommentPosts), profileId);
			} else {
				console.log(`댓글 수집 건너뛰기 (설정에 의해 비활성화)`);
			}

			const result = {
				profile: profileData,
				posts: [], // 실제 게시물 데이터는 이미 저장됨
				followers: followersData,
				detailed_posts: [], // 상세 정보도 이미 저장됨
				comments: [], // 댓글도 이미 저장됨
				profileId: profileId,
				savedPosts: savedPostsCount,
				totalPosts: totalPostsCount,
				detailedPosts: detailedPostsCount,
				savedComments: savedCommentsCount,
				streamProcessed: true // 스트림 처리되었음을 표시
			};

			this.results.push(result);
			return result;

		} catch (error) {
			console.error(`TikTok 인플루언서 스크래핑 오류 (${apiInfluencerId}):`, error.message);
			
			// 부분 성공 결과라도 반환
			if (profileId) {
				return {
				profile: { api_influencer_id: apiInfluencerId },
				posts: [],
				followers: { username: apiInfluencerId, followers: [], total_collected: 0 },
				detailed_posts: [],
				comments: [],
				profileId: profileId,
				savedPosts: savedPostsCount,
				totalPosts: totalPostsCount,
				error: error.message,
				partialSuccess: true
				};
			}
			
			return null;
		}
	}

	/**
	 * TikTok 인플루언서 프로필 정보 수집
	 * @param {string} username - TikTok 사용자명
	 * @returns {Object} 프로필 데이터
	 */
	async scrapeInfluencerProfile(username) {
		try {
			console.log(`실제 프로필 스크래핑 시작: @${username}`);
			
			// 스크래퍼가 초기화되지 않았다면 초기화
			await this.initializeScrapers();
			
			// 실제 TikTok 프로필 스크래퍼 사용
			const profileData = await this.profileScraper.scrapeProfile(username);
			
			if (profileData) {
				// API 호환 형태로 데이터 변환
				return {
					api_influencer_id: username,
					platform: 'tiktok',
					username: profileData.username || username,
					display_name: profileData.display_name,
					bio: profileData.bio,
					followers_count: profileData.followers_count,
					following_count: profileData.following_count,
					likes_count: profileData.likes_count,
					video_count: profileData.video_count,
					profile_image_url: profileData.profile_image_url,
					is_verified: profileData.is_verified,
					is_private: profileData.is_private,
					post_urls: profileData.post_urls || [],
					post_data: profileData.post_data || [], // URL + 조회수 정보
					total_views_from_posts: profileData.total_views_from_posts || 0, // 프로필에서 수집한 총 조회수
					avg_views_per_post: profileData.post_data && profileData.post_data.length > 0 
										? Math.round(profileData.total_views_from_posts / profileData.post_data.length) 
										: 0
				};
			}
			
			return null;
		} catch (error) {
		console.error('TikTok 프로필 스크래핑 오류:', error.message);
		return null;
		}
	}

	/**
	 * TikTok 인플루언서 팔로워 정보 수집
	 * @param {string} username - TikTok 사용자명
	 * @returns {Object} 팔로워 데이터
	 */
	async scrapeInfluencerFollowers(username) {
		try {
			console.log(`실제 팔로워 스크래핑 시작: @${username}`);
			
			// 스크래퍼가 초기화되지 않았다면 초기화
			await this.initializeScrapers();
			
			// 설정에서 팔로워 수집 제한 가져오기
			const maxFollowers = config.scraping.maxFollowersPerProfile || 100;
			
			// 실제 TikTok 팔로워 스크래퍼 사용
			const followersData = await this.followerScraper.scrapeFollowers(username, maxFollowers);
			
			if (followersData && followersData.followers) {
				const verifiedCount = followersData.followers.filter(f => f.is_verified).length;
				console.log(`팔로워 스크래핑 완료: ${followersData.followers.length}명 수집 (인증 ${verifiedCount}명)`);
				console.log(`팔로워 수집 상세: 목표=${maxFollowers}명, 실제=${followersData.followers.length}명, 달성률=${followersData.collection_rate || 0}%`);
				return followersData;
			}
			
			console.log(`팔로워 스크래핑 실패 또는 데이터 없음: @${username}`);
			return { username, followers: [], total_collected: 0 };
		} catch (error) {
			console.error('TikTok 팔로워 스크래핑 오류:', error.message);
			return { username, followers: [], total_collected: 0, error: error.message };
		}
	}

	/**
	 * 게시물 상세 정보 스크래핑
	 * @param {Array} postUrls - 게시물 URL 배열
	 * @param {Array} postData - 프로필에서 수집한 게시물 정보 (URL + 조회수)
	 * @returns {Array} 게시물 상세 데이터 배열
	 */
	async scrapePostDetails(postUrls, postData = []) {
		const detailedPosts = [];
		
		console.log(`${postUrls.length}개 게시물의 상세 정보 수집 중...`);
		
		for (const postUrl of postUrls) {
			try {
				// 프로필에서 수집한 조회수 정보 찾기
				const profileViewData = postData.find(p => p.url === postUrl);
				
				console.log(`게시물 상세 스크래핑: ${postUrl}`);
				const detailedPostData = await this.scrapeSinglePost(postUrl, profileViewData);
				
				if (detailedPostData) {
					detailedPosts.push(detailedPostData);
					console.log(`상세 정보 수집 완료: 좋아요 ${detailedPostData.like_count}, 댓글 ${detailedPostData.comment_count}`);
				}
				
				// 요청 간 딜레이 (설정값 사용)
				const delayMs = this.performanceTracker.getDelay();
				await this.delay(delayMs);
				
			} catch (error) {
				console.error(`게시물 상세 스크래핑 오류 (${postUrl}):`, error.message);
			}
		}
		
		console.log(`게시물 상세 정보 수집 완료: ${detailedPosts.length}개`);
		return detailedPosts;
	}

	/**
	 * 게시물 댓글 스크래핑
	 * @param {Array} postUrls - 게시물 URL 배열
	 * @returns {Array} 댓글 데이터 배열
	 */
	async scrapePostComments(postUrls) {
		const commentsData = [];
		
		console.log(`${postUrls.length}개 게시물의 댓글 수집 중...`);
		
		for (const postUrl of postUrls) {
			try {
				console.log(`댓글 스크래핑 시작: ${postUrl}`);
				
				// 스크래퍼가 초기화되지 않았다면 초기화
				await this.initializeScrapers();
				
						// 댓글 수집 (설정값 사용)
				const maxComments = config.scraping.maxCommentsPerPost || 500;
				const commentResult = await this.commentScraper.scrapeComments(postUrl, maxComments);
				
				if (commentResult && commentResult.total > 0) {
					commentsData.push({
						post_url: postUrl,
						...commentResult
					});
					console.log(`댓글 수집 완료: ${commentResult.total}개 댓글`);
				} else {
					console.log(`댓글 없음: ${postUrl}`);
				}
				
				// 댓글 스크래핑 후 더 긴 딜레이 (댓글 스크래핑은 시간이 오래 걸리므로)
				const delayMs = this.performanceTracker.getDelay() * 3;
				await this.delay(delayMs);
				
			} catch (error) {
				console.error(`댓글 스크래핑 오류 (${postUrl}):`, error.message);
			}
		}
		
		console.log(`댓글 수집 완료: ${commentsData.length}개 게시물`);
		return commentsData;
	}

	/**
	 * URL 정규화 함수 - TikTok URL의 다양한 형태를 표준화
	 */
	normalizeUrl(url) {
		if (!url) return url;
		
		try {
			// 쿼리 파라미터 제거
			let normalized = url.split('?')[0];
			
			// www 통일 (기존 DB 데이터가 www 포함이므로 www 추가)
			if (normalized.includes('https://tiktok.com/') && !normalized.includes('https://www.tiktok.com/')) {
				normalized = normalized.replace('https://tiktok.com', 'https://www.tiktok.com');
			}
			
			// 끝의 슬래시 제거
			normalized = normalized.replace(/\/$/, '');
			
			return normalized;
		} catch (error) {
			console.error('URL 정규화 오류:', error.message);
			return url;
		}
	}

	/**
	 * 단일 게시물을 데이터베이스 저장 형태로 변환 (스트림 처리용)
	 * @param {Object} post - 단일 게시물 정보 (URL + 조회수)
	 * @param {string} username - 인플루언서 사용자명
	 * @returns {Object} 데이터베이스 저장용 게시물 데이터
	 */
	async convertSinglePostToDbFormat(post, username) {
		try {
			// URL 정규화
			const originalUrl = post.url;
			const normalizedUrl = this.normalizeUrl(originalUrl);
			
			if (originalUrl !== normalizedUrl) {
				console.log(`URL 정규화: ${originalUrl} -> ${normalizedUrl}`);
			}
			
			const postId = this.extractPostIdFromUrl(normalizedUrl);
			
			const postRecord = {
				post_url: normalizedUrl, // 정규화된 URL 사용
				post_id: postId,
				content: '', // 프로필에서는 상세 내용 없음
				hashtags: '',
				commerce_hashtags: '',
				hearts: 0, // 프로필에서는 좋아요 수 없음
				comments: 0,
				shares: 0,
				plays: post.viewCount || 0, // 프로필에서 수집한 조회수
				upload_date: post.upload_date || null, // 업로드 날짜 정보 없음 (기존: new Date())
				length: 0,
				cover: '',
				video_url: '',
				music_title: '',
				music_artist: '',
				effects_used: '', // 통합 스키마 컬럼
				is_ad: false, // 통합 스키마 컬럼
				raw_data: JSON.stringify({
				original_url: post.url,
				raw_view_count: post.rawViewCount,
				collected_from: 'profile',
				collected_at: new Date().toISOString()
				}) // 원본 데이터 저장
			};
			
			return postRecord;
			
		} catch (error) {
			console.error(`게시물 변환 오류 (${post.url}):`, error.message);
			throw error;
		}
	}

	/**
	 * 프로필에서 수집한 게시물 정보를 데이터베이스 저장 형태로 변환 (기존 배치 방식)
	 * @param {Array} postData - 프로필에서 수집한 게시물 정보 (URL + 조회수)
	 * @param {string} username - 인플루언서 사용자명
	 * @returns {Array} 데이터베이스 저장용 게시물 데이터 배열
	 */
	async convertProfilePostsToDbFormat(postData, username) {
		const postsData = [];
		
		console.log(`${username}의 ${postData.length}개 게시물을 데이터베이스 형태로 변환 중...`);
		console.log(`변환할 게시물 데이터 (처음 3개):`);
		postData.slice(0, 3).forEach((post, index) => {
			console.log(`  ${index + 1}. ${post.url} - 조회수: ${post.rawViewCount} (${post.viewCount})`);
		});
		
		for (const post of postData) {
			try {
				// URL 정규화
				const originalUrl = post.url;
				const normalizedUrl = this.normalizeUrl(originalUrl);
				
				if (originalUrl !== normalizedUrl) {
					console.log(`게시물 URL 정규화: ${originalUrl} -> ${normalizedUrl}`);
				}
				
				const postId = this.extractPostIdFromUrl(normalizedUrl);
				
				const postRecord = {
					post_url: normalizedUrl, // 정규화된 URL 사용
					post_id: postId,
					platform: 'tiktok',
					content: '', // 프로필에서는 상세 내용 없음
					hashtags: '',
					commerce_hashtags: '',
					hearts: 0, // 프로필에서는 좋아요 수 없음
					comments: 0,
					shares: 0,
					plays: post.viewCount || 0, // 프로필에서 수집한 조회수
					view_count: post.viewCount || 0, // view_count 필드에도 저장
					profile_view_count: post.viewCount || 0, // 프로필에서 수집한 조회수 별도 저장
					profile_view_text: post.rawViewCount || '0', // 원본 텍스트도 저장
					upload_date: null, // 업로드 날짜 정보 없음 (기존: new Date())
					length: 0,
					cover: '',
					video_url: '',
					music_title: '',
					music_artist: ''
				};
				
				console.log(`변환된 게시물: ${normalizedUrl} - 조회수: ${postRecord.view_count}`);
				postsData.push(postRecord);
				
			} catch (error) {
				console.error(`게시물 변환 오류 (${post.url}):`, error.message);
			}
		}
		
		console.log(`${postsData.length}개 게시물 변환 완료`);
		console.log(`변환 요약:`);
		console.log(`  - 총 변환된 게시물: ${postsData.length}개`);
		console.log(`  - 조회수가 있는 게시물: ${postsData.filter(p => p.view_count > 0).length}개`);
		console.log(`  - 총 조회수 합계: ${postsData.reduce((sum, p) => sum + p.view_count, 0).toLocaleString()}회`);
		
		return postsData;
	}

	/**
	 * TikTok 게시물 상세 정보 수집 (필요시에만 사용)
	 * @param {Array} postUrls - 게시물 URL 배열
	 * @param {Array} postData - 프로필에서 수집한 게시물 정보 (URL + 조회수)
	 * @returns {Array} 게시물 상세 데이터 배열
	 */
	async scrapeInfluencerPostDetails(postUrls, postData = []) {
		const postsData = [];
		
		for (const postUrl of postUrls) {
			try {
				// 프로필에서 수집한 조회수 정보 찾기
				const profileViewData = postData.find(p => p.url === postUrl);
				
				const detailedPostData = await this.scrapeSinglePost(postUrl, profileViewData);
				if (detailedPostData) {
					postsData.push(detailedPostData);
				}
				
				// 요청 간 딜레이 (설정값 사용)
				const delayMs = this.performanceTracker.getDelay();
				await this.delay(delayMs);
				
			} catch (error) {
				console.error(`TikTok 게시물 스크래핑 오류 (${postUrl}):`, error.message);
			}
		}
		
		return postsData;
	}

	/**
	 * 단일 TikTok 게시물 스크래핑
	 * @param {string} postUrl - 게시물 URL
	 * @param {Object} profileViewData - 프로필에서 수집한 조회수 정보 (옵션)
	 * @returns {Object} 게시물 데이터
	 */
	async scrapeSinglePost(postUrl, profileViewData = null) {
		try {
			// URL 정규화
			const normalizedUrl = this.normalizeUrl(postUrl);
			if (postUrl !== normalizedUrl) {
				console.log(`상세 스크래핑 URL 정규화: ${postUrl} -> ${normalizedUrl}`);
			}
			
			console.log(`실제 게시물 스크래핑 시작: ${normalizedUrl}`);
			
			// 스크래퍼가 초기화되지 않았다면 초기화
			await this.initializeScrapers();
			
			// 실제 TikTok 게시물 스크래퍼 사용 (정규화된 URL 사용)
			const postData = await this.postScraper.scrapePost(normalizedUrl);
			
			if (postData) {
				// API 호환 형태로 데이터 변환
				const postId = this.extractPostIdFromUrl(normalizedUrl);
				
				// 조회수는 이미 프로필에서 정확하게 수집되어 저장됨
				// 상세 스크래핑에서는 좋아요, 댓글, 공유 수만 수집
				console.log(`상세 스크래핑 - 좋아요: ${postData.like_count || 0}, 댓글: ${postData.comment_count || 0}, 공유: ${postData.share_count || 0}`);
				if (profileViewData) {
					console.log(`조회수: ${profileViewData.rawViewCount} (${profileViewData.viewCount}) - 프로필에서 이미 저장됨`);
				}
				
				return {
					post_url: normalizedUrl, // 정규화된 URL 사용
					post_id: postId,
					platform: 'tiktok',
					content: postData.content || '',
					hashtags: postData.hashtags || [],
					mentions: postData.mentions || [],
					like_count: postData.like_count || 0,
					comment_count: postData.comment_count || 0,
					share_count: postData.share_count || 0,
					// 조회수는 제외 (프로필에서 이미 저장됨)
					upload_date: postData.upload_date || null, // 업로드 날짜 정보 없음 (기존: new Date())
					video_duration: postData.video_duration || 0,
					thumbnail_url: postData.thumbnail_url || '',
					video_url: postData.video_url || '',
					music_title: postData.music_title || '',
					music_artist: postData.music_artist || '',
					comments: [] // 댓글은 별도로 수집
				};
			}
			
			return null;
		} catch (error) {
			console.error('TikTok 단일 게시물 스크래핑 오류:', error.message);
			return null;
		}
	}

	/**
	 * TikTok URL에서 게시물 ID 추출
	 * @param {string} url - TikTok 게시물 URL
	 * @returns {string} 게시물 ID
	 */
	extractPostIdFromUrl(url) {
		try {
			const match = url.match(/\/video\/(\d+)/);
			return match ? match[1] : null;
		} catch (error) {
			console.error('TikTok 게시물 ID 추출 오류:', error.message);
			return null;
		}
	}

	/**
	 * 전체 TikTok 인플루언서 큐 처리
	 */
	async processAllInfluencers() {
		if (this.isProcessing) {
			console.log('이미 TikTok 스크래핑 처리 중입니다.');
			return this.results;
		}

		this.isProcessing = true;
		console.log(`총 ${this.influencerQueue.length}개의 TikTok 인플루언서를 처리합니다.`);

		const results = [];
		
		while (this.influencerQueue.length > 0) {
			const result = await this.processNextInfluencer();
			if (result) {
				results.push(result);
			}
			
			// 인플루언서 간 딜레이 (설정값 사용)
			const delayMs = this.performanceTracker.getDelay();
			await this.delay(delayMs * 2); // 인플루언서 간은 더 긴 딜레이
		}

		this.isProcessing = false;
		console.log(`\n=== TikTok 스크래핑 완료 ===`);
		console.log(`처리된 TikTok 인플루언서: ${results.length}개`);
		
		return results;
	}

	/**
	 * 딜레이 함수
	 * @param {number} ms - 밀리초
	 */
	delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * 현재 큐 상태 확인
	 */
	getQueueStatus() {
		return {
			queueSize: this.influencerQueue.length,
			isProcessing: this.isProcessing,
			processedCount: this.results.length
		};
	}

	/**
	 * 결과 가져오기
	 */
	getResults() {
		return this.results;
	}

	/**
	 * 리소스 정리
	 */
	async cleanup() {
		try {
			console.log('TikTok 스크래퍼 리소스 정리 중...');
			
			// 성능 추적 세션 완료
			if (this.currentSessionId) {
				const stats = {
					influencersProcessed: this.results.length,
					totalPostsCollected: this.results.reduce((sum, r) => sum + (r.posts?.length || 0), 0),
					totalCommentsCollected: 0, // 향후 댓글 수집 시 업데이트
					totalFollowersCollected: 0 // 향후 팔로워 수집 시 업데이트
				};
				
				await this.performanceTracker.endSession(stats);
			}
			
			// 스크래퍼들 정리
			if (this.profileScraper) {
				await this.profileScraper.close();
				this.profileScraper = null;
			}
			
			if (this.postScraper) {
				await this.postScraper.close();
				this.postScraper = null;
			}
			
			if (this.followerScraper) {
				await this.followerScraper.close();
				this.followerScraper = null;
			}
			
			if (this.commentScraper) {
				await this.commentScraper.close();
				this.commentScraper = null;
			}
			
			// 성능 추적기 정리
			if (this.performanceTracker) {
				await this.performanceTracker.cleanup();
			}
			
			this.influencerQueue = [];
			this.isProcessing = false;
			this.results = [];
			this.currentSessionId = null;
			
			console.log('✓ TikTok 스크래퍼 리소스 정리 완료');
		} catch (error) {
			console.error('TikTok 리소스 정리 오류:', error.message);
		}
	}

	/**
	 * 데이터베이스 서비스 주입 (스트림 처리를 위해 필요)
	 * @param {Object} databaseService - 데이터베이스 서비스 인스턴스
	 */
	setDatabaseService(databaseService) {
		this.databaseService = databaseService;
	}

	/**
	 * 팔로워 스크래핑 + 즉시 저장 (스트림 처리)
	 * @param {string} username - TikTok 사용자명
	 * @param {number} profileId - 저장된 프로필 ID
	 * @returns {Object} 팔로워 데이터
	 */
	async scrapeAndSaveFollowers(username, profileId) {
		try {
			console.log(`실제 팔로워 스크래핑 + 저장 시작: @${username}`);
			
			// 설정에서 팔로워 수집 제한 가져오기
			const maxFollowers = config.scraping.maxFollowersPerProfile || 100;
			
			// 실제 TikTok 팔로워 스크래퍼 사용
			const followersData = await this.followerScraper.scrapeFollowers(username, maxFollowers);
			
			if (followersData && followersData.followers && followersData.followers.length > 0) {
				console.log(`팔로워 데이터 즉시 저장 중: ${followersData.followers.length}명`);
				
				// 즉시 저장
				const savedCount = await this.databaseService.saveFollowersData(profileId, followersData);
				
				console.log(`팔로워 저장 완료: ${savedCount}명`);
				
				return {
				...followersData,
				savedCount: savedCount
				};
			}
			
			console.log(`⚠️ 팔로워 스크래핑 실패 또는 데이터 없음: @${username}`);
			return { username, followers: [], total_collected: 0 };
		} catch (error) {
			console.error('팔로워 스크래핑 + 저장 오류:', error.message);
			return { username, followers: [], total_collected: 0, error: error.message };
		}
	}

	/**
	 * 게시물 상세 정보 스크래핑 + 즉시 업데이트 (스트림 처리)
	 * @param {Array} postUrls - 게시물 URL 배열
	 * @param {number} profileId - 저장된 프로필 ID
	 * @returns {number} 업데이트된 게시물 수
	 */
	async scrapeAndUpdatePostDetails(postUrls, profileId) {
		let updatedCount = 0;
		
		console.log(`${postUrls.length}개 게시물의 상세 정보 수집 + 즉시 업데이트 중...`);
		
		for (let i = 0; i < postUrls.length; i++) {
			const postUrl = postUrls[i];
			
			try {
				console.log(`상세 정보 ${i + 1}/${postUrls.length} 처리 중: ${postUrl}`);
				
				// 게시물 상세 정보 스크래핑
				const detailedPostData = await this.scrapeSinglePost(postUrl);
				
				if (detailedPostData) {
					const uploadDate = new Date(detailedPostData.upload_date);
					const now = new Date();
					const threeMonthsAgo = new Date(now);
					threeMonthsAgo.setMonth(now.getMonth() - 1);
					if (i >= 10 && uploadDate < threeMonthsAgo) {
						console.log(`3개월 초과 게시물(10개 이후) 건너뜀: ${postUrl} (${detailedPostData.upload_date})`);
						continue;
					}
					// 데이터베이스에서 해당 게시물 찾기
					const foundPost = await this.databaseService.findPostByUrl(postUrl, profileId);
					
					if (foundPost) {
						// 즉시 업데이트
						await this.databaseService.updatePostDetails(foundPost.id, detailedPostData);
						updatedCount++;
						console.log(`업데이트 완료 (${updatedCount}/${postUrls.length}): 좋아요 ${detailedPostData.like_count}`);
					} else {
						console.log(`게시물을 찾을 수 없음: ${postUrl}`);
					}
				}
				
				// 요청 간 딜레이
				const delayMs = this.performanceTracker.getDelay();
				await this.delay(delayMs);
				
			} catch (error) {
				console.error(`상세 정보 처리 실패 (${i + 1}/${postUrls.length}): ${postUrl}`, error.message);
				// 에러가 나도 계속 진행
			}
		}
		
		console.log(`상세 정보 업데이트 완료: ${updatedCount}개`);
		return updatedCount;
	}

	/**
	 * 댓글 스크래핑 + 즉시 저장 (스트림 처리)
	 * @param {Array} postUrls - 게시물 URL 배열
	 * @param {number} profileId - 저장된 프로필 ID
	 * @returns {number} 저장된 댓글 게시물 수
	 */
	async scrapeAndSaveComments(postUrls, profileId) {
		let savedPostsCount = 0;
		
		console.log(`${postUrls.length}개 게시물의 댓글 스트림 수집 + 실시간 저장 중...`);
		
		// 댓글 스크래퍼에 데이터베이스 서비스 주입
		if (this.databaseService) {
			this.commentScraper.setDatabaseService(this.databaseService);
		}
		
		for (let i = 0; i < postUrls.length; i++) {
			const postUrl = postUrls[i];
			
			try {
				const postStartTime = new Date();
				console.log(`댓글 ${i + 1}/${postUrls.length} 스트림 처리 시작: ${postUrl}`);
				console.log(`시작 시간: ${postStartTime.toLocaleString('ko-KR')}`);
				
				// 댓글 수집 (설정값 사용)
				const maxComments = config.scraping.maxCommentsPerPost || 500;
				
				// 스트림 방식 댓글 수집 (실시간 저장)
				const streamResult = await this.commentScraper.scrapeCommentsStream(postUrl, profileId, maxComments);
				
				const postEndTime = new Date();
				const postDuration = postEndTime - postStartTime;
				const postDurationMinutes = Math.round(postDuration / 1000 / 60 * 100) / 100;
				
				console.log(`종료 시간: ${postEndTime.toLocaleString('ko-KR')}`);
				console.log(`소요 시간: ${postDurationMinutes}분 (${Math.round(postDuration / 1000)}초)`);
				
				if (streamResult && streamResult.success) {
					savedPostsCount++;
					console.log(`스트림 저장 완료 (${savedPostsCount}/${postUrls.length}): ${streamResult.savedComments}개 댓글`);
					
					// 저장 통계 확인
					const stats = await this.databaseService.getCommentsSaveStats(profileId, postUrl);
					console.log(`통계: 총 ${stats.total_comments}개 댓글 저장 완료`);
					console.log(`수집 속도: ${Math.round(streamResult.savedComments / postDurationMinutes)}개/분`);
					
				} else {
					console.log(`스트림 수집 실패: ${postUrl}`);
					if (streamResult && streamResult.error) {
						console.log(`    오류: ${streamResult.error}`);
					}
				}
				
				// 댓글 스크래핑 후 더 긴 딜레이 (스트림 처리는 이미 내부적으로 딜레이가 있음)
				const delayMs = this.performanceTracker.getDelay() * 2;
				await this.delay(delayMs);
				
			} catch (error) {
				console.error(`댓글 스트림 처리 실패 (${i + 1}/${postUrls.length}): ${postUrl}`, error.message);
				// 에러가 나도 계속 진행
			}
		}
		
		const totalEndTime = new Date();
		const totalDuration = totalEndTime - new Date(); // 전체 시간은 외부에서 계산이 어려우니 대략적으로
		
		console.log(`════════════════════════════════════════════════════════════`);
		console.log(`전체 댓글 스트림 저장 완료!`);
		console.log(`처리 완료: ${savedPostsCount}/${postUrls.length}개 게시물`);
		console.log(`전체 완료 시간: ${totalEndTime.toLocaleString('ko-KR')}`);
		
		if (savedPostsCount > 0) {
			console.log(`성공률: ${Math.round((savedPostsCount / postUrls.length) * 100)}%`);
		}
		
		console.log(`════════════════════════════════════════════════════════════\n`);
		
		return savedPostsCount;
	}

	/**
	 * 기존 방식으로 처리 (데이터베이스 서비스가 없을 때)
	 * @param {string} apiInfluencerId - 인플루언서 ID
	 * @param {Object} profileData - 프로필 데이터
	 * @returns {Object} 처리 결과
	 */
	async processInfluencerLegacy(apiInfluencerId, profileData) {
		try {
			// 기존 배치 처리 방식
			const postUrls = profileData.post_urls || [];
			const postData = profileData.post_data || [];
			
			if (postUrls.length === 0) {
				console.log(`TikTok 게시물 URL 수집 실패: ${apiInfluencerId}`);
				return { profile: profileData, posts: [] };
			}

			console.log(`프로필에서 수집된 게시물: ${postData.length}개 (URL: ${postUrls.length}개)`);

			// 프로필에서 수집한 게시물 정보를 데이터베이스 저장 형태로 변환
			const postsData = await this.convertProfilePostsToDbFormat(postData, profileData.username);

			// 팔로워 정보 수집 (설정에 따라)
			let followersData = { username: apiInfluencerId, followers: [], total_collected: 0 };
			if (config.scraping.enableFollowerScraping) {
				console.log(`\n팔로워 수집 시작: @${apiInfluencerId}`);
				followersData = await this.scrapeInfluencerFollowers(apiInfluencerId);
			} else {
				console.log(`팔로워 수집 건너뛰기 (설정에 의해 비활성화)`);
			}

			// 게시물 상세 정보 수집 (설정에 따라)
			let detailedPostsData = [];
			if (config.scraping.enablePostDetailScraping) {
				console.log(`\n게시물 상세 정보 수집 시작...`);
				const maxDetailedPosts = config.scraping.maxDetailedPosts || 5;
				detailedPostsData = await this.scrapePostDetails(postUrls.slice(0, maxDetailedPosts), postData);
			} else {
				console.log(`게시물 상세 정보 수집 건너뛰기 (설정에 의해 비활성화)`);
			}

			// 댓글 정보 수집 (설정에 따라)
			let commentsData = [];
			if (config.scraping.enableCommentScraping) {
				console.log(`\n댓글 수집 시작...`);
				const maxCommentPosts = config.scraping.maxCommentPosts || 3;
				commentsData = await this.scrapePostComments(postUrls.slice(0, maxCommentPosts));
			} else {
				console.log(`댓글 수집 건너뛰기 (설정에 의해 비활성화)`);
			}

			const result = {
				profile: profileData,
				posts: postsData,
				followers: followersData,
				detailed_posts: detailedPostsData,
				comments: commentsData,
				legacyProcessed: true // 기존 방식으로 처리되었음을 표시
			};

			return result;

		} catch (error) {
			console.error(`기존 방식 처리 오류 (${apiInfluencerId}):`, error.message);
			return null;
		}
	}
}

module.exports = TikTokScraper; 