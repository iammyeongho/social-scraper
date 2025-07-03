const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config').tiktok;

puppeteer.use(StealthPlugin());

/**
 * 틱톡 게시물 스크래퍼
 * 개별 비디오의 상세 정보를 수집
 */
class TikTokPostScraper {
	constructor() {
		this.browser = null;
		this.page = null;
	}

	/**
	 * 브라우저 초기화
	 */
	async initialize() {
		try {
			console.log('틱톡 게시물 스크래퍼 초기화 중...');
			
			this.browser = await puppeteer.launch({
				headless: config.headless,
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
					'--disable-accelerated-2d-canvas',
					'--no-first-run',
					'--no-zygote',
					'--disable-gpu',
					`--window-size=${config.desktopViewport.width},${config.desktopViewport.height}`,
					'--lang=ko-KR,ko'
				]
			});

			this.page = await this.browser.newPage();
			
			// 데스크톱 User-Agent 설정
			await this.page.setUserAgent(config.desktopUserAgent);
			
			// 데스크톱 뷰포트 설정
			await this.page.setViewport({
				width: config.desktopViewport.width,
				height: config.desktopViewport.height
			});

			console.log('✓ 틱톡 게시물 스크래퍼 초기화 완료 (데스크톱 뷰)');
			return true;

		} catch (error) {
			console.error('틱톡 게시물 스크래퍼 초기화 오류:', error.message);
			return false;
		}
	}

	/**
	 * 틱톡 게시물 스크래핑
	 * @param {string} postUrl - 게시물 URL
	 * @returns {Promise<Object>} 게시물 데이터
	 */
	async scrapePost(postUrl) {
		try {
			console.log(`틱톡 게시물 스크래핑 시작: ${postUrl}`);
			
			await this.page.goto(postUrl, { 
				waitUntil: 'networkidle2',
				timeout: config.timeout 
			});

			// 페이지 로딩 대기
			await this.delay(config.pageLoadDelay);

			// 디버깅: 페이지 요소 확인
			await this.debugPageElements();

			// 게시물 정보 수집
			const { postData, uploadDateText, uploadDateParsed } = await this.page.evaluate((selectors, url) => {
				// 날짜 계산 함수 (evaluate 내부에 선언)
				const calculateDate = (dateText) => {
					if (!dateText) return new Date().toISOString();
					const now = new Date();
					const currentYear = now.getFullYear();
					if (/^\d{1,2}-\d{1,2}$/.test(dateText)) {
						const [month, day] = dateText.split('-').map(Number);
						const date = new Date(currentYear, month - 1, day);
						if (date > now) {
							date.setFullYear(currentYear - 1);
						}
						return date.toISOString();
					}
					const agoMatch = dateText.match(/^(\d+)([dwmy]) ago$/i);
					if (agoMatch) {
						const amount = parseInt(agoMatch[1]);
						const unit = agoMatch[2].toLowerCase();
						const date = new Date(now);
						switch (unit) {
							case 'd': date.setDate(date.getDate() - amount); break;
							case 'w': date.setDate(date.getDate() - (amount * 7)); break;
							case 'm': date.setMonth(date.getMonth() - amount); break;
							case 'y': date.setFullYear(date.getFullYear() - amount); break;
						}
						return date.toISOString();
					}
					// 기타 형태는 현재 날짜 반환
					return now.toISOString();
				};
				const mobileSelectors = selectors.post.mobile;
				const uploadDateElement = document.querySelector(mobileSelectors.uploadDate) || document.querySelector(selectors.post.uploadDate);
				const uploadDateText = uploadDateElement ? uploadDateElement.textContent.trim() : '';
				const uploadDateParsed = uploadDateText ? calculateDate(uploadDateText) : null;
				
				// 작성자 정보
				const usernameElement = document.querySelector(mobileSelectors.username) || document.querySelector(selectors.post.username);
				const displayNameElement = document.querySelector(mobileSelectors.displayName) || document.querySelector(selectors.post.displayName);
				
				// 비디오 설명 (본문) - 새로운 구조
				const contentContainer = document.querySelector(selectors.post.content);
				const contentText = contentContainer ? contentContainer.innerText.trim() : '';
				const contentTextElements = document.querySelectorAll(selectors.post.contentText);
				
				// 해시태그와 멘션 (새로운 구조)
				const hashtagElements = document.querySelectorAll(selectors.post.hashtags);
				const mentionElements = document.querySelectorAll(selectors.post.mentions);
				
				// 상호작용 수 (모바일 선택자 우선)
				const likeElement = document.querySelector(mobileSelectors.likeCount) || document.querySelector(selectors.post.likeCount);
				const commentElement = document.querySelector(mobileSelectors.commentCount) || document.querySelector(selectors.post.commentCount);
				const shareElement = document.querySelector(mobileSelectors.shareCount) || document.querySelector(selectors.post.shareCount);
				const bookmarkElement = document.querySelector(mobileSelectors.bookmarkCount) || document.querySelector(selectors.post.bookmarkCount);
				const viewElement = document.querySelector(mobileSelectors.viewCount) || document.querySelector(selectors.post.viewCount);
				
				// 비디오 길이
				const durationElement = document.querySelector(selectors.post.videoDuration);
				
				// 썸네일
				const thumbnailElement = document.querySelector(selectors.post.thumbnail);
				
				// 음악 정보
				const musicTitleElement = document.querySelector(mobileSelectors.musicTitle) || document.querySelector(selectors.post.musicTitle);
				const musicArtistElement = document.querySelector(mobileSelectors.musicArtist) || document.querySelector(selectors.post.musicArtist);
				
				// 인증 배지
				const verifiedBadgeElement = document.querySelector(selectors.post.verifiedBadge);
				const privateBadgeElement = document.querySelector(selectors.post.privateBadge);
				
				// 위치 정보
				const locationElement = document.querySelector(selectors.post.location);
				
				// 숫자 정규화 함수
				const normalizeNumber = (text) => {
					if (!text) return 0;
					const num = text.replace(/[^0-9.]/g, '');
					if (text.includes('K')) return parseFloat(num) * 1000;
					if (text.includes('M')) return parseFloat(num) * 1000000;
					if (text.includes('B')) return parseFloat(num) * 1000000000;
					return parseInt(num) || 0;
				};

				// 해시태그 추출 (새로운 구조)
				const hashtags = Array.from(hashtagElements).map(el => {
					const strongElement = el.querySelector('strong');
					const text = strongElement ? strongElement.textContent.trim() : el.textContent.trim();
					const href = el.getAttribute('href');
					return {
						text: text,
						url: href ? `https://www.tiktok.com${href}` : ''
					};
				});
				
				// 멘션 추출 (새로운 구조)
				const mentions = Array.from(mentionElements).map(el => {
					const strongElement = el.querySelector('strong');
					const text = strongElement ? strongElement.textContent.trim() : el.textContent.trim();
					const href = el.getAttribute('href');
					return {
						text: text,
						url: href ? `https://www.tiktok.com${href}` : ''
					};
				});
				
				// 비디오 URL 추출 (video 태그에서)
				const videoElement = document.querySelector(selectors.post.videoElement);
				const videoUrl = videoElement ? videoElement.src : '';
				
				// 추가 정보 수집
				const hashtagTexts = hashtags.map(h => h.text);
				const mentionTexts = mentions.map(m => m.text);
				
				return {
					postData: {
						post_url: url,
						username: usernameElement ? usernameElement.textContent.trim() : '',
						display_name: displayNameElement ? displayNameElement.textContent.trim() : '',
						content: contentText,
						content_spans: Array.from(contentTextElements).map(el => el.textContent.trim()),
						hashtags: hashtagTexts,
						hashtags_detail: hashtags,
						mentions: mentionTexts,
						mentions_detail: mentions,
						like_count: normalizeNumber(likeElement ? likeElement.textContent : '0'),
						comment_count: normalizeNumber(commentElement ? commentElement.textContent : '0'),
						share_count: normalizeNumber(shareElement ? shareElement.textContent : '0'),
						bookmark_count: normalizeNumber(bookmarkElement ? bookmarkElement.textContent : '0'),
						view_count: normalizeNumber(viewElement ? viewElement.textContent : '0'),
						upload_date: uploadDateParsed,
						video_duration: durationElement ? durationElement.textContent.trim() : '',
						video_url: videoUrl,
						thumbnail_url: thumbnailElement ? thumbnailElement.src : '',
						music_title: musicTitleElement ? musicTitleElement.textContent.trim() : '',
						music_artist: musicArtistElement ? musicArtistElement.textContent.trim() : '',
						is_verified: !!verifiedBadgeElement,
						is_private: !!privateBadgeElement,
						location: locationElement ? locationElement.textContent.trim() : '',
						scraped_at: new Date().toISOString()
					},
					uploadDateText,
					uploadDateParsed
				};
			}, config.selectors, postUrl);
			console.log('uploadDateText:', uploadDateText);
			console.log('calculateDate output:', uploadDateParsed);
			
			console.log(`✓ 게시물 스크래핑 완료: ${postUrl}`);
			console.log(`  - 작성자: @${postData.username}`);
			console.log(`  - 좋아요: ${postData.like_count}`);
			console.log(`  - 댓글: ${postData.comment_count}`);
			console.log(`  - 공유: ${postData.share_count}`);
			console.log(`  - 조회수: ${postData.view_count}`);

			return postData;
		} catch (error) {
			console.error(`틱톡 게시물 스크래핑 오류 (${postUrl}):`, error.message);
			
			// 오류 시 스크린샷 저장 - 제거됨
			return null;
		}
	}

	/**
	 * 페이지 요소 디버깅
	 */
	async debugPageElements() {
		try {
			console.log('=== 페이지 요소 디버깅 ===');
			
			const debugInfo = await this.page.evaluate(() => {
				function safeSelector(el) {
					let sel = el.tagName;
					if (el.id) sel += '#' + el.id;
					if (typeof el.className === 'string' && el.className.length > 0) sel += '.' + el.className.split(' ').join('.');
					return sel;
				}

				const pick = (selector) => Array.from(document.querySelectorAll(selector)).map(el => ({
					selector: safeSelector(el),
					text: el.textContent.trim(),
					dataE2e: el.getAttribute('data-e2e')
				}));

				return {
					like: pick('[data-e2e*="like"]'),
					comment: pick('[data-e2e*="comment"]'),
					share: pick('[data-e2e*="share"]'),
					bookmark: pick('[data-e2e*="undefined-count"]')
				};
			});
			console.log('좋아요:', debugInfo.like);
			console.log('댓글:', debugInfo.comment);
			console.log('공유:', debugInfo.share);
			console.log('북마크:', debugInfo.bookmark);
			// 디버그 스크린샷 제거됨
		} catch (error) {
			console.error('디버깅 중 오류:', error.message);
		}
	}

	/**
	 * 여러 게시물 스크래핑
	 * @param {Array} postUrls - 게시물 URL 배열
	 * @returns {Promise<Array>} 게시물 데이터 배열
	 */
	async scrapeMultiplePosts(postUrls) {
		const results = [];
		const threeMonthsAgo = new Date();
		threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
		let stop = false;
		
		for (const postUrl of postUrls) {
			if (stop) break;
			try {
				const postData = await this.scrapePost(postUrl);
				if (postData) {
					// 게시일자 3개월 이내 체크
					const uploadDate = new Date(postData.upload_date);
					const now = new Date();
					const threeMonthsAgo = new Date(now);
					threeMonthsAgo.setMonth(now.getMonth() - 1);
					console.log('uploadDate 원본:', postData.upload_date);
					console.log('uploadDate 객체:', uploadDate, uploadDate.getTime());
					console.log('threeMonthsAgo:', threeMonthsAgo, threeMonthsAgo.getTime());
					console.log('uploadDate < threeMonthsAgo:', uploadDate < threeMonthsAgo);
					if (uploadDate < threeMonthsAgo) {
						console.log(`1개월 초과 게시물 발견, 이후 스크래핑 중단: ${postUrl} (${postData.upload_date})`);
						stop = true;
						break;
					}
					results.push(postData);
				}
				// 요청 간 딜레이
				await this.delay(config.requestDelay);
			} catch (error) {
				console.error(`게시물 스크래핑 오류 (${postUrl}):`, error.message);
			}
		}
		return results;
	}

	/**
	 * 브라우저 종료
	 */
	async close() {
		try {
			if (this.browser) {
				await this.browser.close();
				console.log('✓ 틱톡 게시물 스크래퍼 종료');
			}
		} catch (error) {
			console.error('브라우저 종료 오류:', error.message);
		}
	}

	/**
	 * 딜레이 함수
	 * @param {number} ms - 밀리초
	 */
	delay(ms) {
			return new Promise(resolve => setTimeout(resolve, ms));
		}
	}

	module.exports = TikTokPostScraper;

	// 메인 실행 로직 (파일이 직접 실행될 때만)
	if (require.main === module) {
		async function main() {
			const scraper = new TikTokPostScraper();
			
			try {
				// 스크래퍼 초기화
				const initialized = await scraper.initialize();
				if (!initialized) {
					console.error('스크래퍼 초기화 실패');
					return;
				}
				
				const testPostUrl = 'https://www.tiktok.com/@changbi_book/video/7517208183597763858';
				
				const postData = await scraper.scrapePost(testPostUrl);
				
				if (postData) {
					console.log('스크래핑 결과:');
					console.log(JSON.stringify(postData, null, 2));
					
					// 결과를 파일로 저장
					const fs = require('fs');
					const timestamp = Date.now();
					const filename = `output/tiktok_post_${timestamp}.json`;
					fs.writeFileSync(filename, JSON.stringify(postData, null, 2));
					console.log(`결과를 ${filename}에 저장했습니다.`);
				}
			} catch (error) {
				console.error('스크래핑 중 오류 발생:', error.message);
			} finally {
				// 브라우저 종료
				await scraper.close();
			}
		}
		main().catch(console.error);
}
