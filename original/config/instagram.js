module.exports = {
  // 브라우저 설정
  browser: {
    headless: false,
    defaultViewport: null,
    args: [
      '--window-size=390,844',
      '--lang=ko-KR,ko',
      '--disable-blink-features=AutomationControlled',
      '--incognito',  // 시크릿 모드 활성화 (게시물 스크래핑용)
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
    ],
  },

  // 로그인된 브라우저 설정 (프로필 스크래핑용)
  loggedInBrowser: {
    headless: false,
    defaultViewport: null,
    userDataDir: './user_data', // 로그인 세션 저장
    args: [
      '--window-size=390,844',
      '--lang=ko-KR,ko',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
    ],
  },

  // 스크래핑 설정
  scraping: {
    // 페이지 로딩 대기 시간 (ms)
    pageLoadDelay: 2000,
    
    // 팝업 닫기 대기 시간 (ms)
    popupCloseDelay: 500,
    
    // 더보기 버튼 클릭 대기 시간 (ms)
    moreButtonDelay: 400,
    
    // 캐러셀 네비게이션 대기 시간 (ms)
    carouselDelay: 600,
    
    // 캐러셀 최대 스텝 수
    maxCarouselSteps: 20,
    
    // 조사 목적 대기 시간 (ms) - 5분
    investigationDelay: 300000,
    
    // 프로필 스크래핑 설정
    profile: {
      // 무한 스크롤 설정
      scrollDelay: 1000,
      maxScrollAttempts: 50,
      sameCountThreshold: 3, // 3번 연속 변화 없으면 종료
      
      // 로그인 필요 여부
      requiresLogin: true,
      
      // 더미 계정 설정
      dummyAccount: {
        username: 'dummy_username', // 실제 더미 계정으로 변경 필요
        password: 'dummy_password', // 실제 더미 계정으로 변경 필요
        autoLogin: false, // 향후 자동 로그인 활성화 예정
      },
    },
  },

  // CSS 선택자 (인스타그램 업데이트 시 수정 필요)
  selectors: {
    // 사용자 닉네임
    username: 'span._ap3a._aaco._aacw._aacx._aad7._aade',
    
    // 게시물 본문
    content: 'span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.xt0psk2.x1i0vuye.xvs91rp.xo1l8bm.x5n08af.x10wh9bi.xpm28yp.x8viiok.x1o7cslx.x126k92a',
    
    // 해시태그 링크
    hashtags: 'a[href*="/explore/tags/"]',
    
    // 멘션 링크 (@로 시작하는 사용자)
    mentions: 'a[href^="/"][href*="/"]:not([href*="/explore/tags/"])',
    
    // 사용자 태그 (사진에 태그된 사용자)
    taggedUsers: 'div._aa1y a[role="link"]',
    
    // 위치 정보
    location: 'a[href*="/explore/locations/"]',
    
    // 좋아요 수
    likeCount: 'span.html-span.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1hl2dhg.x16tdsg8.x1vvkbs',
    
    // 댓글 수 (View all X comments)
    commentCount: 'span.x1lliihq.x1plvlek.xryxfnj.x1n2onr6.x1ji0vk5.x18bv5gf.x193iq5w.xeuugli.x1fj9vlw.x13faqbe.x1vvkbs.x1s928wv.xhkezso.x1gmr53x.x1cpjm7i.x1fgarty.x1943h6x.x1i0vuye.xvs91rp.xo1l8bm.x1roi4f4.x10wh9bi.xpm28yp.x8viiok.x1o7cslx',
    
    // 댓글 목록
    commentList: 'ul._a9ym',
    
    // 댓글 아이템
    commentItem: 'li._a9zj._a9zl',
    
    // 게시일자
    uploadDate: 'time._a9ze._a9zf',
    
    // 더보기 버튼
    moreButton: 'xpath//span[text()="more" or text()="더보기"]',
    
    // 캐러셀 다음 버튼
    nextButton: 'button[aria-label="Next"], button._afxw',
    
    // 이미지
    images: 'article img',
    
    // 비디오
    videos: 'article video',
    
    // 팝업 다이얼로그
    dialog: 'div[role="dialog"]',
  },

  // 테스트용 게시물 URL
  testUrls: [
    'https://www.instagram.com/eyesmag/reel/DLS5KoxIIlF/',
  ],
}; 