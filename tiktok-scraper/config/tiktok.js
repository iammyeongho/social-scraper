// 틱톡 스크래핑 설정
module.exports = {
	// 브라우저 설정
	headless: 'new', // 디버깅을 위해 false로 변경
	timeout: 60000, // 타임아웃을 60초로 증가
	pageLoadDelay: 500, // 페이지 로딩 대기시간
	
	// 뷰포트 설정 (데스크톱 - 프로필용)
	viewport: {
		width: 1920,
		height: 1080
	},
	
	// 데스크톱 뷰포트 설정 (게시물 상세용)
	desktopViewport: {
		width: 1920,
		height: 1080
	},
	
	// 모바일 뷰포트 설정 (게시물 상세용)
	mobileViewport: {
		width: 768,
		height: 1024
	},
	
	// 윈도우 크기 설정
	windowSize: {
		width: 1920,
		height: 1080
	},
	
	// 데스크톱 User-Agent
	desktopUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	
	// User-Agent (데스크톱)
	userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	
	// 모바일 User-Agent
	mobileUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
	
	// 스크롤 설정
	scroll: {
		maxPosts: 200, // 최대 수집할 게시물 수 (scraping.maxPostsPerProfile과 일치)
		maxScrollAttempts: 300, // 최대 스크롤 시도 횟수 (더 증가)
		scrollStep: 800, // 한 번에 스크롤할 픽셀 수
		delay: 500, // 스크롤 간 대기 시간 (밀리초) - 증가
		loadDelay: 500, // 새 콘텐츠 로딩 대기 시간 - 증가
		minNewPostsPerScroll: 1 // 스크롤당 최소 새로운 게시물 수
	},
	
	// 선택자 설정
	selectors: {
		profile: {
			username: '[data-e2e="user-title"]',
			displayName: '[data-e2e="user-subtitle"]',
			bio: '[data-e2e="user-bio"]',
			followersCount: '[data-e2e="followers-count"]',
			followingCount: '[data-e2e="following-count"]',
			likesCount: '[data-e2e="likes-count"]',
			profileImage: '[data-e2e="user-avatar"] img',
			verifiedBadge: 'svg[data-e2e="verified-badge"]',
			bioLink: '[data-e2e="user-bio-link"]',
			bioLinkText: '[data-e2e="user-bio-link-text"]'
		},
		posts: {
			container: '[data-e2e="user-post-item"]',
			link: 'a[href*="/video/"]',
			thumbnail: 'img',
			videoCount: '[data-e2e="video-count"]'
		},
		post: {
			// 작성자 정보
			username: '[data-e2e="video-author-uniqueid"]',
			displayName: '[data-e2e="video-author-nickname"]',
			
			// 비디오 설명 (본문)
			content: 'div[data-e2e="browse-video-desc"]',
			contentText: 'span[data-e2e="new-desc-span"]',
			
			// 해시태그와 멘션 (실제 구조에 맞게)
			hashtags: 'a[data-e2e="search-common-link"][href*="/tag/"]',
			mentions: 'a[data-e2e="search-common-link"][href*="/@"]',
			
			// 데스크톱 상호작용 수
			likeCount: 'div[data-e2e="play-side-like"]',
			commentCount: 'div[data-e2e="play-side-comment"]',
			shareCount: 'div[data-e2e="play-side-share"]',
			bookmarkCount: 'div[data-e2e="play-side-favorite"]',
			viewCount: '[data-e2e="video-views"]',
			
			// 업로드 날짜
			uploadDate: 'span[data-e2e="browser-nickname"] span:last-child',
			uploadDateContainer: 'span[data-e2e="browser-nickname"]',
			
			// 비디오 길이
			videoDuration: '[data-e2e="video-duration"]',
			
			// 비디오 요소
			videoElement: 'video',
			
			// 썸네일
			thumbnail: 'img[alt*="created by"]',
			
			// 음악 정보
			musicTitle: '[data-e2e="music-title"]',
			musicArtist: '[data-e2e="music-artist"]',
			
			// 인증 배지
			verifiedBadge: '[data-e2e="author-verified-badge"]',
			privateBadge: '[data-e2e="author-private-badge"]',
			
			// 추가 정보
			location: '[data-e2e="video-location"]',
			hashtagList: '[data-e2e="video-desc"] a[href*="/tag/"]',
			mentionList: '[data-e2e="video-desc"] a[href*="/@"]',
			
			// 모바일 전용 선택자
			mobile: {
				// 모바일에서 더 안정적인 선택자들
				likeCount: 'strong[data-e2e="like-count"]',
				commentCount: 'strong[data-e2e="comment-count"]',
				shareCount: 'strong[data-e2e="share-count"]',
				bookmarkCount: 'strong[data-e2e="undefined-count"]',
				viewCount: '[data-e2e="video-views"]',
				content: '[data-e2e="video-desc"]',
				username: '[data-e2e="video-author-uniqueid"]',
				displayName: '[data-e2e="video-author-nickname"]',
				uploadDate: '[data-e2e="video-create-time"]',
				musicTitle: '[data-e2e="music-title"]',
				musicArtist: '[data-e2e="music-artist"]'
			}
		}
	},
	
	// 스크래핑 설정
	scraping: {
		enableProfileScraping: false, // 프로필 스크래핑
		enablePostDetailScraping: false, // 게시물 상세 스크래핑 
		enableCommentScraping: false, // 댓글 스트림 스크래핑
		enableFollowerScraping: true, // 팔로워 스크래핑
		
		// 수집 제한
		maxPostsPerProfile: 100, // 프로필당 최대 게시물 수
		maxDetailedPosts: 100, // 상세 스크래핑할 게시물 수
		maxCommentsPerPost: null, // 게시물당 최대 댓글 수
		maxFollowersPerProfile: 50, // 프로필당 최대 팔로워 수
		maxCommentPosts: 100 // 댓글을 수집할 게시물 수 
	},

	// 요청 딜레이 설정
	requestDelay: 3000, // 요청 간 대기 시간 (밀리초)
	
	// 옵션 설정
	options: {
		enableLogging: true, // 상세 로깅 활성화
		saveScreenshots: false, // 스크린샷 저장 비활성화
		retryOnError: true, // 오류 시 재시도
		maxRetries: 3 // 최대 재시도 횟수
	}
}; 