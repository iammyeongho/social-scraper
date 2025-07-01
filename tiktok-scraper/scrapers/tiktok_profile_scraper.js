const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config').tiktok;

puppeteer.use(StealthPlugin());

/**
 * 틱톡 프로필 스크래퍼
 * 프로필 정보와 게시물 URL 목록을 수집
 */
class TikTokProfileScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * 브라우저 초기화
   */
  async initialize() {
    try {
      console.log('틱톡 프로필 스크래퍼 초기화 중...');
      
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
          `--window-size=${config.windowSize.width},${config.windowSize.height}`,
          '--lang=ko-KR,ko',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor',
          '--disable-web-security',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--no-default-browser-check',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-hang-monitor',
          '--disable-sync',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-client-side-phishing-detection',
          '--disable-component-extensions-with-background-pages',
          '--allow-running-insecure-content'
        ]
      });

      this.page = await this.browser.newPage();
      
      // User-Agent 설정
      await this.page.setUserAgent(config.userAgent);
      
      // 뷰포트 설정
      await this.page.setViewport({
        width: config.viewport.width,
        height: config.viewport.height
      });

      console.log('✓ 틱톡 프로필 스크래퍼 초기화 완료');
      return true;

    } catch (error) {
      console.error('틱톡 프로필 스크래퍼 초기화 오류:', error.message);
      return false;
    }
  }

  /**
   * 틱톡 프로필 스크래핑
   * @param {string} username - 틱톡 사용자명
   * @returns {Promise<Object>} 프로필 데이터
   */
  async scrapeProfile(username) {
    try {
      console.log(`틱톡 프로필 스크래핑 시작: @${username}`);
      
      const profileUrl = `https://www.tiktok.com/@${username}`;
      await this.page.goto(profileUrl, { 
        waitUntil: 'networkidle2',
        timeout: config.timeout 
      });

      // 페이지 로딩 대기
      await this.delay(config.pageLoadDelay);

      // 프로필 정보 수집
      const profileData = await this.extractProfileInfo(username);
      
      // 스크롤을 통해 게시물 정보 수집 (URL + 조회수)
      const postData = await this.scrollAndExtractPostUrls();

      console.log(`✓ 프로필 스크래핑 완료: @${username}`);
      console.log(`  - 팔로워: ${profileData.followers_count}`);
      console.log(`  - 팔로잉: ${profileData.following_count}`);
      console.log(`  - 게시물: ${profileData.video_count}`);
      console.log(`  - 수집된 게시물: ${postData.length}개`);
      if (postData.length > 0) {
        const totalViews = postData.reduce((sum, post) => sum + post.viewCount, 0);
        console.log(`  - 총 조회수: ${totalViews.toLocaleString()}회`);
        console.log(`  - 평균 조회수: ${Math.round(totalViews / postData.length).toLocaleString()}회`);
      }
      console.log(`  - 비즈니스 계정: ${profileData.is_verified ? '예' : '아니오'}`);

      return {
        ...profileData,
        post_urls: postData.map(post => post.url), // URL만 추출한 배열
        post_data: postData, // URL + 조회수 정보 전체
        total_views_from_posts: postData.reduce((sum, post) => sum + post.viewCount, 0)
      };

    } catch (error) {
      console.error(`틱톡 프로필 스크래핑 오류 (@${username}):`, error.message);
      
      // 오류 시 스크린샷 저장 - 제거됨
      
      return null;
    }
  }

  /**
   * 스크롤을 통해 게시물 URL 수집
   * @returns {Promise<Array>} 게시물 URL 배열
   */
  async scrollAndExtractPostUrls() {
    try {
      console.log('게시물 정보 수집을 위한 스크롤 시작...');
      
      // 스크래핑 설정의 maxPostsPerProfile을 우선 사용 (더 구체적인 설정)
      const maxPosts = config.scraping?.maxPostsPerProfile || config.scroll.maxPosts;
      console.log(`목표: ${maxPosts}개 게시물 (설정: scraping.maxPostsPerProfile=${config.scraping?.maxPostsPerProfile}, scroll.maxPosts=${config.scroll.maxPosts})`);
      console.log(`스크롤 스텝: ${config.scroll.scrollStep}px, 딜레이: ${config.scroll.delay}ms`);
      
      let allPosts = [];
      let scrollAttempts = 0;
      let consecutiveNoNewPosts = 0;
      let consecutiveNoScroll = 0;
      let lastPostCount = 0;
      let stuckCount = 0;
      const maxConsecutiveNoNewPosts = 20; // 연속 20번 새 게시물이 없으면 중단 (증가)
      const maxConsecutiveNoScroll = 10; // 연속 10번 스크롤이 안되면 중단 (증가)
      const maxStuckCount = 5; // 연속 5번 게시물 수가 같으면 강제 스크롤
      
      while (scrollAttempts < config.scroll.maxScrollAttempts && allPosts.length < maxPosts) {
        // 현재 페이지의 게시물 정보 추출 (URL + 조회수)
        const currentPosts = await this.extractCurrentPagePostUrls();
        const previousCount = allPosts.length;
        
        // 새로운 게시물들을 기존 배열에 추가 (중복 제거)
        currentPosts.forEach(post => {
          if (!allPosts.find(p => p.url === post.url)) {
            allPosts.push(post);
          }
        });
        
        const newPostsCount = allPosts.length - previousCount;
        
        console.log(`스크롤 ${scrollAttempts + 1}/${config.scroll.maxScrollAttempts}: ${allPosts.length}/${maxPosts}개 게시물 (새로 발견: ${newPostsCount}개)`);
        
        // 새로운 게시물이 있으면 조회수 정보 표시
        if (newPostsCount > 0) {
          const newPosts = allPosts.slice(previousCount);
          newPosts.slice(0, 3).forEach((post, index) => { // 최대 3개만 표시
            console.log(`  🎬 새 게시물 ${index + 1}: ${post.rawViewCount} 조회수`);
          });
          if (newPosts.length > 3) {
            console.log(`  📋 그 외 ${newPosts.length - 3}개 게시물 더 발견됨`);
          }
        }
        
        // 진행률 표시
        if (maxPosts > 0) {
          const progress = Math.round((allPosts.length / maxPosts) * 100);
          console.log(`  📊 진행률: ${progress}% (${allPosts.length}/${maxPosts})`);
        }
        
        // 목표 게시물 수에 도달했는지 확인
        if (allPosts.length >= maxPosts) {
          console.log(`목표 게시물 수(${maxPosts}개)에 도달했습니다.`);
          break;
        }
        
        // 게시물 수가 변하지 않았는지 확인
        if (allPosts.length === lastPostCount) {
          stuckCount++;
          console.log(`게시물 수가 변하지 않았습니다. (연속 ${stuckCount}/${maxStuckCount})`);
          
          if (stuckCount >= maxStuckCount) {
            console.log('게시물 수가 멈춘 상태입니다. 강제 스크롤을 시도합니다...');
            await this.forceScroll();
            stuckCount = 0; // 카운터 리셋
          }
        } else {
          stuckCount = 0; // 게시물 수가 변하면 카운터 리셋
        }
        lastPostCount = allPosts.length;
        
        // 스크롤 실행 (여러 방법 시도)
        let scrolled = false;
        
        // 방법 1: 일반 스크롤
        scrolled = await this.scrollDown();
        
        // 방법 2: 일반 스크롤이 실패하면 더 큰 스텝으로 시도
        if (!scrolled) {
          console.log('일반 스크롤 실패, 더 큰 스텝으로 재시도...');
          scrolled = await this.scrollDownLarge();
        }
        
        // 방법 3: 스크롤이 실패하면 페이지 끝까지 스크롤 시도
        if (!scrolled) {
          console.log('스크롤 실패, 페이지 끝까지 스크롤 시도...');
          scrolled = await this.scrollToBottom();
        }
        
        if (!scrolled) {
          consecutiveNoScroll++;
          console.log(`스크롤 실패. (연속 ${consecutiveNoScroll}/${maxConsecutiveNoScroll})`);
          
          if (consecutiveNoScroll >= maxConsecutiveNoScroll) {
            console.log('연속으로 스크롤이 실패하여 중단합니다.');
            break;
          }
        } else {
          consecutiveNoScroll = 0; // 스크롤 성공시 카운터 리셋
        }
        
        // 새로운 게시물이 충분히 로드되지 않았는지 확인
        if (newPostsCount < config.scroll.minNewPostsPerScroll) {
          consecutiveNoNewPosts++;
          console.log(`새로운 게시물이 부족합니다. (연속 ${consecutiveNoNewPosts}/${maxConsecutiveNoNewPosts})`);
          
          if (consecutiveNoNewPosts >= maxConsecutiveNoNewPosts) {
            console.log('연속으로 새로운 게시물이 부족하여 스크롤을 중단합니다.');
            break;
          }
        } else {
          consecutiveNoNewPosts = 0; // 새로운 게시물이 발견되면 카운터 리셋
        }
        
        // 스크롤 후 대기 (새 콘텐츠 로딩 대기) - 대기 시간 증가
        await this.delay(config.scroll.loadDelay + 1000);
        
        // 추가 대기 (스크롤 간 딜레이) - 대기 시간 증가
        await this.delay(config.scroll.delay);
        
        scrollAttempts++;
        
        // 중간에 스크린샷 저장 (디버깅용)
        // 스크롤 디버깅 스크린샷 제거됨
      }
      
      // 최대 게시물 수로 제한
      const limitedPosts = allPosts.slice(0, maxPosts);
      
      console.log(`\n📊 게시물 수집 완료 요약:`);
      console.log(`  - 목표: ${maxPosts}개 게시물`);
      console.log(`  - 실제 수집: ${limitedPosts.length}개 게시물`);
      console.log(`  - 달성률: ${Math.round((limitedPosts.length / maxPosts) * 100)}%`);
      
      if (limitedPosts.length > 0) {
        const totalViews = limitedPosts.reduce((sum, post) => sum + post.viewCount, 0);
        const avgViews = Math.round(totalViews / limitedPosts.length);
        console.log(`  - 총 조회수: ${totalViews.toLocaleString()}회`);
        console.log(`  - 평균 조회수: ${avgViews.toLocaleString()}회`);
        console.log(`  - 최고 조회수: ${Math.max(...limitedPosts.map(p => p.viewCount)).toLocaleString()}회`);
        console.log(`  - 최저 조회수: ${Math.min(...limitedPosts.map(p => p.viewCount)).toLocaleString()}회`);
      }
      
      return limitedPosts;
      
    } catch (error) {
      console.error('스크롤 및 게시물 URL 추출 오류:', error.message);
      return [];
    }
  }

  /**
   * 강제 스크롤 (멈춘 상태에서 복구)
   */
  async forceScroll() {
    try {
      console.log('강제 스크롤 실행...');
      
      // 여러 방법으로 강제 스크롤 시도
      await this.page.evaluate(() => {
        // 방법 1: 키보드 스크롤
        window.scrollBy(0, 1000);
        
        // 방법 2: 스크롤 이벤트 발생
        window.dispatchEvent(new Event('scroll'));
        
        // 방법 3: 휠 이벤트 발생
        window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
      });
      
      // 강제 스크롤 후 충분한 대기
      await this.delay(3000);
      
      console.log('강제 스크롤 완료');
    } catch (error) {
      console.error('강제 스크롤 오류:', error.message);
    }
  }

  /**
   * 현재 페이지의 게시물 URL과 조회수 정보 추출
   * @returns {Promise<Array>} 현재 페이지의 게시물 정보 배열 {url, viewCount, rawViewCount}
   */
  async extractCurrentPagePostUrls() {
    try {
      const postData = await this.page.evaluate((selectors) => {
        const posts = [];
        
        // 숫자 정규화 함수 (15.6K -> 15600)
        const normalizeViewCount = (text) => {
          if (!text) return 0;
          
          const cleanText = text.trim().toLowerCase();
          let multiplier = 1;
          
          if (cleanText.includes('k')) {
            multiplier = 1000;
          } else if (cleanText.includes('m')) {
            multiplier = 1000000;
          } else if (cleanText.includes('b')) {
            multiplier = 1000000000;
          }
          
          const number = parseFloat(cleanText.replace(/[^0-9.]/g, ''));
          return isNaN(number) ? 0 : Math.round(number * multiplier);
        };
        
        // 방법 1: 게시물 컨테이너에서 URL과 조회수 함께 추출
        const postContainers = document.querySelectorAll('div[class*="DivWrapper"] a[href*="/video/"]');
        postContainers.forEach(linkElement => {
          try {
            const href = linkElement.getAttribute('href');
            if (!href || !href.includes('/video/') || href.includes('#')) return;
            
            const fullUrl = href.startsWith('http') ? href : `https://www.tiktok.com${href}`;
            
            // 같은 컨테이너 내에서 조회수 찾기
            const container = linkElement.closest('div[class*="DivWrapper"]') || linkElement.parentElement;
            const viewElement = container ? container.querySelector('strong[data-e2e="video-views"]') : null;
            const rawViewCount = viewElement ? viewElement.textContent.trim() : '0';
            const normalizedViewCount = normalizeViewCount(rawViewCount);
            
            posts.push({
              url: fullUrl,
              viewCount: normalizedViewCount,
              rawViewCount: rawViewCount
            });
            
          } catch (e) {
            console.log('개별 게시물 처리 오류:', e);
          }
        });
        
        // 방법 2: 전체 a 태그에서 비디오 링크 찾기 (조회수 정보 없어도 수집)
        const allVideoLinks = document.querySelectorAll('a[href*="/video/"]');
        allVideoLinks.forEach(linkElement => {
          try {
            const href = linkElement.getAttribute('href');
            if (!href || !href.includes('/video/') || href.includes('#')) return;
            
            const fullUrl = href.startsWith('http') ? href : `https://www.tiktok.com${href}`;
            
            // 이미 추가된 URL인지 확인
            if (posts.find(p => p.url === fullUrl)) return;
            
            // 부모 요소에서 조회수 찾기 시도
            let viewElement = linkElement.querySelector('strong[data-e2e="video-views"]');
            if (!viewElement) {
              const parent = linkElement.closest('div');
              viewElement = parent ? parent.querySelector('strong[data-e2e="video-views"]') : null;
            }
            
            const rawViewCount = viewElement ? viewElement.textContent.trim() : '0';
            const normalizedViewCount = normalizeViewCount(rawViewCount);
            
            posts.push({
              url: fullUrl,
              viewCount: normalizedViewCount,
              rawViewCount: rawViewCount
            });
            
          } catch (e) {
            console.log('개별 게시물 처리 오류:', e);
          }
        });
        
        // 중복 제거 (URL 기준)
        const uniquePosts = [];
        const seenUrls = new Set();
        
        posts.forEach(post => {
          if (!seenUrls.has(post.url)) {
            seenUrls.add(post.url);
            uniquePosts.push(post);
          }
        });
        
        console.log(`현재 페이지에서 ${uniquePosts.length}개의 비디오 발견`);
        uniquePosts.forEach((post, index) => {
          console.log(`  ${index + 1}. 조회수: ${post.rawViewCount} (${post.viewCount}) - ${post.url.split('/').pop()}`);
        });
        
        return uniquePosts;
      }, config.selectors);

      return postData;

    } catch (error) {
      console.error('현재 페이지 게시물 정보 추출 오류:', error.message);
      return [];
    }
  }

  /**
   * 페이지를 아래로 스크롤
   * @returns {Promise<boolean>} 스크롤 성공 여부
   */
  async scrollDown() {
    try {
      const scrolled = await this.page.evaluate((scrollStep) => {
        const previousHeight = document.body.scrollHeight;
        const previousScrollTop = window.pageYOffset;
        
        // 부드러운 스크롤을 위해 작은 단위로 나누어 스크롤
        const steps = 5;
        const stepSize = scrollStep / steps;
        
        for (let i = 0; i < steps; i++) {
          window.scrollBy(0, stepSize);
        }
        
        // 스크롤 후 페이지 높이 변화 확인
        const newHeight = document.body.scrollHeight;
        const newScrollTop = window.pageYOffset;
        
        return {
          heightChanged: newHeight > previousHeight,
          scrolled: newScrollTop > previousScrollTop,
          newHeight: newHeight,
          previousHeight: previousHeight,
          scrollDistance: newScrollTop - previousScrollTop
        };
      }, config.scroll.scrollStep);
      
      // 스크롤 결과 로깅
      if (config.options.enableLogging) {
        console.log(`스크롤 결과: 높이변화=${scrolled.heightChanged}, 스크롤됨=${scrolled.scrolled}, 스크롤거리=${scrolled.scrollDistance}px, 높이=${scrolled.previousHeight}→${scrolled.newHeight}`);
      }
      
      return scrolled.heightChanged || scrolled.scrolled;
    } catch (error) {
      console.error('스크롤 오류:', error.message);
      return false;
    }
  }

  /**
   * 페이지를 아래로 스크롤 (큰 스텝)
   * @returns {Promise<boolean>} 스크롤 성공 여부
   */
  async scrollDownLarge() {
    try {
      const scrolled = await this.page.evaluate((scrollStep) => {
        const previousHeight = document.body.scrollHeight;
        const previousScrollTop = window.pageYOffset;
        
        // 더 큰 스텝으로 스크롤
        window.scrollBy(0, scrollStep * 2);
        
        // 스크롤 후 페이지 높이 변화 확인
        const newHeight = document.body.scrollHeight;
        const newScrollTop = window.pageYOffset;
        
        return {
          heightChanged: newHeight > previousHeight,
          scrolled: newScrollTop > previousScrollTop,
          newHeight: newHeight,
          previousHeight: previousHeight,
          scrollDistance: newScrollTop - previousScrollTop
        };
      }, config.scroll.scrollStep);
      
      if (config.options.enableLogging) {
        console.log(`큰 스텝 스크롤 결과: 높이변화=${scrolled.heightChanged}, 스크롤됨=${scrolled.scrolled}, 스크롤거리=${scrolled.scrollDistance}px`);
      }
      
      return scrolled.heightChanged || scrolled.scrolled;
    } catch (error) {
      console.error('큰 스텝 스크롤 오류:', error.message);
      return false;
    }
  }

  /**
   * 페이지 끝까지 스크롤
   * @returns {Promise<boolean>} 스크롤 성공 여부
   */
  async scrollToBottom() {
    try {
      const scrolled = await this.page.evaluate(() => {
        const previousHeight = document.body.scrollHeight;
        const previousScrollTop = window.pageYOffset;
        
        // 페이지 끝까지 스크롤
        window.scrollTo(0, document.body.scrollHeight);
        
        // 스크롤 후 페이지 높이 변화 확인
        const newHeight = document.body.scrollHeight;
        const newScrollTop = window.pageYOffset;
        
        return {
          heightChanged: newHeight > previousHeight,
          scrolled: newScrollTop > previousScrollTop,
          newHeight: newHeight,
          previousHeight: previousHeight,
          scrollDistance: newScrollTop - previousScrollTop
        };
      });
      
      if (config.options.enableLogging) {
        console.log(`페이지 끝 스크롤 결과: 높이변화=${scrolled.heightChanged}, 스크롤됨=${scrolled.scrolled}, 스크롤거리=${scrolled.scrollDistance}px`);
      }
      
      return scrolled.heightChanged || scrolled.scrolled;
    } catch (error) {
      console.error('페이지 끝 스크롤 오류:', error.message);
      return false;
    }
  }

  /**
   * 프로필 정보 추출
   * @param {string} username - 사용자명
   * @returns {Promise<Object>} 프로필 정보
   */
  async extractProfileInfo(username) {
    try {
      const profileData = await this.page.evaluate((selectors, username) => {
        // 사용자명
        const usernameElement = document.querySelector(selectors.profile.username);
        const displayNameElement = document.querySelector(selectors.profile.displayName);
        
        // 자기소개
        const bioElement = document.querySelector(selectors.profile.bio);
        
        // 팔로워/팔로잉/게시물 수
        const followersElement = document.querySelector(selectors.profile.followersCount);
        const followingElement = document.querySelector(selectors.profile.followingCount);
        const likesElement = document.querySelector(selectors.profile.likesCount);
        
        // 프로필 이미지
        const profileImageElement = document.querySelector(selectors.profile.profileImage);
        
        // 인증 배지 (비즈니스 계정) - 여러 방법으로 확인
        let isVerified = false;
        
        // 방법 1: SVG 파란색 원 확인
        const verifiedBadgeElement = document.querySelector(selectors.profile.verifiedBadge);
        if (verifiedBadgeElement) {
          isVerified = true;
        }
        
        // 방법 2: data-e2e 속성으로 확인
        const verifiedElements = document.querySelectorAll('[data-e2e*="verified"]');
        if (verifiedElements.length > 0) {
          isVerified = true;
        }
        
        // 방법 3: SVG 내부 path 확인 (체크마크)
        const checkmarkSvg = document.querySelector('svg path[d*="M37.1213 15.8787"]');
        if (checkmarkSvg) {
          isVerified = true;
        }
        
        // 소개 링크
        const bioLinkElement = document.querySelector(selectors.profile.bioLink);
        const bioLinkTextElement = document.querySelector(selectors.profile.bioLinkText);
        
        // 숫자 정규화 함수
        const normalizeNumber = (text) => {
          if (!text) return 0;
          const num = text.replace(/[^0-9.]/g, '');
          if (text.includes('K')) return parseFloat(num) * 1000;
          if (text.includes('M')) return parseFloat(num) * 1000000;
          if (text.includes('B')) return parseFloat(num) * 1000000000;
          return parseInt(num) || 0;
        };
        
        return {
          username: username,
          display_name: displayNameElement ? displayNameElement.textContent.trim() : '',
          bio: bioElement ? bioElement.textContent.trim() : '',
          followers_count: normalizeNumber(followersElement ? followersElement.textContent : '0'),
          following_count: normalizeNumber(followingElement ? followingElement.textContent : '0'),
          likes_count: normalizeNumber(likesElement ? likesElement.textContent : '0'),
          video_count: normalizeNumber(likesElement ? likesElement.textContent : '0'), // likes-count가 실제로는 게시물 수
          profile_image_url: profileImageElement ? profileImageElement.src : '',
          is_verified: isVerified,
          is_private: false, // 비공개 계정 여부는 별도 확인 필요
          bio_link: bioLinkElement ? bioLinkElement.href : '',
          bio_link_text: bioLinkTextElement ? bioLinkTextElement.textContent.trim() : ''
        };
      }, config.selectors, username);

      return profileData;

    } catch (error) {
      console.error('프로필 정보 추출 오류:', error.message);
      return {
        username: username,
        display_name: '',
        bio: '',
        followers_count: 0,
        following_count: 0,
        likes_count: 0,
        video_count: 0,
        profile_image_url: '',
        is_verified: false,
        is_private: false,
        bio_link: '',
        bio_link_text: ''
      };
    }
  }

  /**
   * 브라우저 종료
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log('✓ 틱톡 프로필 스크래퍼 종료');
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

module.exports = TikTokProfileScraper; 