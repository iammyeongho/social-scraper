const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config').tiktok;

puppeteer.use(StealthPlugin());

/**
 * 강화된 틱톡 댓글 스크래퍼 (스트림 처리 방식)
 * 게시물의 댓글과 답글을 실시간으로 수집하고 즉시 저장
 */
class TikTokCommentScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.databaseService = null; // 스트림 처리를 위한 DB 서비스
    this.currentProfileId = null; // 현재 처리 중인 프로필 ID
    this.currentPostUrl = null; // 현재 처리 중인 게시물 URL
    this.savedCommentsCount = 0; // 실시간 저장된 댓글 수
  }

  /**
   * 데이터베이스 서비스 주입 (스트림 처리용)
   * @param {Object} databaseService - 데이터베이스 서비스 인스턴스
   */
  setDatabaseService(databaseService) {
    this.databaseService = databaseService;
  }

  /**
   * 브라우저 초기화
   */
  async initialize() {
    try {
      console.log('🚀 TikTok 댓글 스크래퍼 초기화 중...');
      
      this.browser = await puppeteer.launch({
        headless: false, // TikTok이 헤드리스 모드를 차단하므로 헤드풀 유지
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--lang=ko-KR,ko',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling', // 백그라운드 타이머 제한 비활성화
          '--disable-backgrounding-occluded-windows', // 백그라운드 창 비활성화 방지
          '--disable-renderer-backgrounding', // 렌더러 백그라운딩 비활성화
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection'
        ],
        defaultViewport: null,
        ignoreDefaultArgs: ['--enable-automation']
      });

      this.page = await this.browser.newPage();
      
      // 백그라운드에서도 작동하도록 설정
      await this.page.evaluateOnNewDocument(() => {
        // 페이지 비활성화 방지
        Object.defineProperty(document, 'hidden', {
          value: false,
          writable: false
        });
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          writable: false
        });
        
        // 타이머 제한 방지
        window.requestAnimationFrame = window.requestAnimationFrame || function(callback) {
          return setTimeout(callback, 16);
        };
        
        // 포커스 이벤트 시뮬레이션
        window.hasFocus = () => true;
      });
      
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await this.page.setViewport({ width: 1920, height: 1080 });

      console.log('✅ 초기화 완료');
      return true;

    } catch (error) {
      console.error('❌ 초기화 오류:', error.message);
      return false;
    }
  }

  /**
   * 틱톡 게시물의 댓글 스크래핑 (스트림 처리 방식)
   * @param {string} postUrl - 게시물 URL
   * @param {number} profileId - 프로필 ID  
   * @param {number} maxComments - 수집할 최대 댓글 수 (null이면 무제한)
   * @returns {Promise<Object>} 저장 결과 정보
   */
  async scrapeCommentsStream(postUrl, profileId, maxComments = null) {
    // 스트림 처리 초기화
    this.currentProfileId = profileId;
    this.currentPostUrl = postUrl;
    this.savedCommentsCount = 0;
    
    // 기본 제한값 설정
    if (!maxComments) {
      maxComments = 500; // 기본 제한값 (테스트용)
    }
    
    const startTime = new Date();
    const startTimestamp = Date.now();
    
    try {
      console.log(`\n💬 댓글 스트림 수집 시작: ${postUrl}`);
      console.log(`🎯 목표: 최대 ${maxComments}개 댓글 (profileId: ${profileId})`);
      console.log(`🕐 시작 시간: ${startTime.toLocaleString('ko-KR')}`);
      console.log(`════════════════════════════════════════════════════════════`);
      
      // 기존 스크래핑 로직 실행 (하지만 추출 부분에서 실시간 저장)
      console.log('🌐 페이지 로딩 중...');
      await this.page.goto(postUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      await this.page.bringToFront();
      await this.page.focus('body');
      
      console.log('⏳ 페이지 로딩 대기 중...');
      await this.delay(15000);
      
      console.log('⏸️ 영상 일시정지 중...');
      await this.pauseVideo();
      
      console.log('📜 댓글 섹션으로 스크롤 중...');
      await this.scrollToComments();
      
      console.log('🔍 1차 답글 더보기 버튼 클릭 중...');
      await this.clickViewMoreButtons();
      
      console.log('🔄 진짜 스트림 방식: 댓글 나올 때마다 즉시 저장...');
      await this.realTimeCommentStream(maxComments);
      
      const endTime = new Date();
      const endTimestamp = Date.now();
      const duration = endTimestamp - startTimestamp;
      const durationMinutes = Math.round(duration / 1000 / 60 * 100) / 100;
      
      console.log(`════════════════════════════════════════════════════════════`);
      console.log(`✅ 스트림 수집 완료!`);
      console.log(`🕐 종료 시간: ${endTime.toLocaleString('ko-KR')}`);
      console.log(`⏱️ 총 소요 시간: ${durationMinutes}분 (${Math.round(duration / 1000)}초)`);
      console.log(`💾 실시간 저장된 댓글: ${this.savedCommentsCount}개`);
      console.log(`📈 평균 저장 속도: ${Math.round(this.savedCommentsCount / durationMinutes)}개/분`);
      
      if (maxComments && this.savedCommentsCount >= maxComments) {
        console.log(`🎯 목표 수량(${maxComments}개)에 도달하여 완료`);
      }
      
      console.log(`════════════════════════════════════════════════════════════\n`);
      
      return {
        success: true,
        profileId: profileId,
        postUrl: postUrl,
        savedComments: this.savedCommentsCount,
        maxComments: maxComments,
        isLimitReached: maxComments ? this.savedCommentsCount >= maxComments : false,
        duration: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          durationMs: duration,
          durationMinutes: durationMinutes
        }
      };
      
    } catch (error) {
      console.error('❌ 스트림 수집 오류:', error.message);
      
      return {
        success: false,
        profileId: profileId,
        postUrl: postUrl,
        savedComments: this.savedCommentsCount,
        error: error.message
      };
    }
  }

  /**
   * 틱톡 게시물의 댓글 스크래핑 (기존 배치 방식)
   * @param {string} postUrl - 게시물 URL
   * @param {number} maxComments - 수집할 최대 댓글 수 (null이면 무제한)
   * @returns {Promise<Object>} 댓글 데이터 객체
   */
  async scrapeComments(postUrl, maxComments = null) {
    // 기본 제한값 설정 (null이면 기본값 사용)
    if (!maxComments) {
      maxComments = 500; // 기본 제한값
    }
    const startTime = new Date();
    const startTimestamp = Date.now();
    
    try {
      console.log(`\n📱 댓글 스크래핑 시작: ${postUrl}`);
      console.log(`🕐 시작 시간: ${startTime.toLocaleString('ko-KR')}`);
      
      console.log('🌐 페이지 로딩 중...');
      await this.page.goto(postUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      // 페이지 로딩 후 즉시 활성화
      await this.page.bringToFront();
      await this.page.focus('body');
      
      console.log('⏳ 페이지 로딩 대기 중...');
      await this.delay(15000);
      
      console.log('⏸️ 영상 일시정지 중...');
      await this.pauseVideo();
      
      console.log('📜 댓글 섹션으로 스크롤 중...');
      await this.scrollToComments();
      
      console.log('🔍 1차 답글 더보기 버튼 클릭 중...');
      await this.clickViewMoreButtons();
      
      console.log('🔄 댓글 더 로딩 중...');
      await this.loadMoreComments(maxComments);
      
      console.log('🔍 2차 답글 더보기 버튼 클릭 중...');
      await this.clickViewMoreButtons();
      
      console.log('📝 댓글 추출 중...');
      const comments = await this.extractAllComments();
      
      const endTime = new Date();
      const endTimestamp = Date.now();
      const duration = endTimestamp - startTimestamp;
      const durationMinutes = Math.round(duration / 1000 / 60 * 100) / 100;
      
      console.log(`\n✅ 스크래핑 완료!`);
      console.log(`🕐 종료 시간: ${endTime.toLocaleString('ko-KR')}`);
      console.log(`⏱️ 총 소요 시간: ${durationMinutes}분 (${Math.round(duration / 1000)}초)`);
      console.log(`📊 메인 댓글: ${comments.mainComments.length}개, 답글: ${comments.replies.length}개`);
      console.log(`📝 총 수집된 댓글: ${comments.total}개`);
      console.log(`📈 평균 수집 속도: ${Math.round(comments.total / durationMinutes)}개/분`);
      if (maxComments && comments.total >= maxComments) {
        console.log(`🎯 목표 수량(${maxComments}개)에 도달하여 완료`);
      }
      
      // 시간 정보와 제한 정보를 댓글 데이터에 추가
      comments.timing = {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        startTimestamp,
        endTimestamp,
        durationMs: duration,
        durationMinutes
      };
      
      comments.collection_info = {
        target_limit: maxComments,
        collected_count: comments.total,
        collection_rate: maxComments ? Math.round((comments.total / maxComments) * 100) : 100,
        is_limit_reached: maxComments ? comments.total >= maxComments : false
      };
      
      return comments;
      
    } catch (error) {
      console.error('❌ 스크래핑 오류:', error.message);
      
      // 오류 스크린샷 저장 - 제거됨
      
      return { mainComments: [], replies: [], allComments: [], total: 0 };
    }
  }

  /**
   * 영상 일시정지
   */
  async pauseVideo() {
    try {
      const paused = await this.page.evaluate(() => {
        // 다양한 방법으로 일시정지 버튼 찾기
        const pauseSelectors = [
          'div.css-q1bwae-DivPlayIconContainer',
          '[data-e2e="video-play-icon"]',
          '[class*="PlayIcon"]',
          'video',
          '[class*="play-icon"]'
        ];
        
        for (const selector of pauseSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            console.log(`🎯 일시정지 요소 발견: ${selector}`);
            
            if (selector === 'video') {
              // 비디오 요소 직접 제어
              element.pause();
              console.log('✅ 비디오 직접 일시정지');
              return true;
            } else {
              // 버튼 클릭
              element.click();
              console.log('✅ 일시정지 버튼 클릭');
              return true;
            }
          }
        }
        
        return false;
      });
      
      if (paused) {
        console.log('✅ 영상 일시정지 완료');
      } else {
        console.log('⚠️ 일시정지 버튼을 찾을 수 없음');
      }
      
      await this.delay(2000);
    } catch (error) {
      console.log('⚠️ 영상 일시정지 중 오류:', error.message);
    }
  }

  /**
   * 댓글 섹션으로 스크롤
   */
  async scrollToComments() {
    try {
      // 점진적 스크롤로 댓글 섹션 찾기 (강화)
      for (let i = 0; i < 12; i++) { // 더 많이 스크롤해서 초기 댓글 로딩 강화
        // 매번 페이지 활성화
        if (i % 2 === 0) {
          await this.page.bringToFront();
          await this.page.evaluate(() => {
            window.focus();
            document.body.focus();
          });
        }
        
        await this.page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.8);
        });
        await this.delay(2000);
        
        // 중간중간 댓글이 있는지 확인
        const commentCount = await this.page.evaluate(() => {
          const comments = document.querySelectorAll('span[data-e2e="comment-level-1"], span[data-e2e="comment-level-2"]');
          return comments.length;
        });
        
        if (commentCount > 0) {
          console.log(`📊 스크롤 중 댓글 발견: ${commentCount}개`);
        }
      }
      
      // 페이지 끝까지 스크롤 후 다시 댓글 섹션으로
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        // 잠깐 기다렸다가 댓글 섹션 근처로 다시 스크롤
        setTimeout(() => {
          window.scrollTo(0, document.body.scrollHeight * 0.6);
        }, 2000);
      });
      
      await this.delay(7000); // 더 긴 대기
      console.log('✅ 댓글 섹션 스크롤 완료');
    } catch (error) {
      console.log('⚠️ 스크롤 중 오류:', error.message);
    }
  }

  /**
   * 더 많은 댓글 로딩
   */
  async loadMoreComments(maxComments) {
    try {
      let loadedComments = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 40; // 스크롤 시도 횟수 대폭 증가
      
      console.log(`🔄 최대 ${maxComments}개 댓글 로딩 시작... (실제 전달된 값: ${maxComments})`);
      
      while ((maxComments === null || loadedComments < maxComments) && scrollAttempts < maxScrollAttempts) {
        // 현재 댓글 수 확인 + 로딩 완료 신호 감지
        const { commentCount: currentCommentCount, isEnd } = await this.page.evaluate(() => {
          const mainComments = document.querySelectorAll('span[data-e2e="comment-level-1"]');
          const replies = document.querySelectorAll('span[data-e2e="comment-level-2"]');
          
          // 로딩 완료 신호 감지
          const endSignals = [
            'word word word', 
            'no more comments',
            '더 이상 댓글이 없습니다',
            'end of comments',
            'loading failed'
          ];
          
          const bodyText = document.body.innerText.toLowerCase();
          const isEndDetected = endSignals.some(signal => bodyText.includes(signal.toLowerCase()));
          
          return {
            commentCount: mainComments.length + replies.length,
            isEnd: isEndDetected
          };
        });
        
        // "word word word" 같은 종료 신호 감지 시 즉시 중단
        if (isEnd) {
          console.log('🛑 댓글 로딩 완료 신호 감지 - 스크롤 중단');
          break;
        }
        
        if (currentCommentCount === loadedComments) {
          scrollAttempts++;
          // 연속으로 10번 같은 댓글 수면 조기 종료
          if (scrollAttempts >= 10) {
            console.log('🛑 10번 연속 동일한 댓글 수 - 더 이상 로드되지 않음');
            break;
          }
        } else {
          loadedComments = currentCommentCount;
          scrollAttempts = 0; // 새 댓글이 로드되면 카운터 리셋
        }
        
        // 강화된 스크롤 - 6가지 다양한 패턴 사용
        await this.page.evaluate((attempt) => {
          // 스크롤 패턴을 더 다양하게 변화시켜서 더 많은 댓글 로딩
          const pattern = attempt % 6;
          
          if (pattern === 0) {
            // 큰 단위로 스크롤
            window.scrollBy(0, window.innerHeight * 2);
          } else if (pattern === 1) {
            // 작은 단위로 여러 번 스크롤
            for (let i = 0; i < 4; i++) {
              setTimeout(() => window.scrollBy(0, window.innerHeight / 4), i * 200);
            }
          } else if (pattern === 2) {
            // 끝까지 스크롤 후 조금 위로
            window.scrollTo(0, document.body.scrollHeight);
            setTimeout(() => window.scrollBy(0, -window.innerHeight / 2), 500);
          } else if (pattern === 3) {
            // 중간 스크롤 여러 번
            window.scrollBy(0, window.innerHeight / 2);
            setTimeout(() => window.scrollBy(0, window.innerHeight / 2), 400);
          } else if (pattern === 4) {
            // 위아래 스크롤 조합
            window.scrollBy(0, window.innerHeight * 1.5);
            setTimeout(() => window.scrollBy(0, -window.innerHeight / 4), 600);
            setTimeout(() => window.scrollBy(0, window.innerHeight), 1200);
          } else {
            // 기본 스크롤 + 추가 스크롤
            window.scrollBy(0, window.innerHeight);
            setTimeout(() => window.scrollBy(0, window.innerHeight / 3), 300);
          }
        }, scrollAttempts);
        
                  await this.delay(2500); // 대기 시간 조정 (정확성 우선)
          
          // 백그라운드 방지: 더 자주 페이지 활성화
        if (scrollAttempts % 2 === 0) {
          await this.page.bringToFront();
          await this.page.evaluate(() => {
            window.focus();
            document.dispatchEvent(new Event('visibilitychange'));
          });
        }
        
        if (scrollAttempts % 5 === 0) { // 5번마다 로그 출력
          console.log(`📊 현재 로드된 댓글 수: ${currentCommentCount} (시도: ${scrollAttempts}/${maxScrollAttempts})`);
        }
      }
      
      console.log(`✅ 댓글 로딩 완료: ${loadedComments}개 (${scrollAttempts}번 시도)`);
    } catch (error) {
      console.error('댓글 로딩 중 오류:', error.message);
    }
  }

  /**
   * 답글 더보기 버튼들 클릭 (강화된 버전)
   */
  async clickViewMoreButtons() {
    try {
      let totalClicked = 0;
      
      for (let attempt = 0; attempt < 12; attempt++) { // 답글 더보기 버튼 클릭 시도 증가
        console.log(`🔄 시도 ${attempt + 1}/12 - 답글 더보기 버튼 찾는 중...`);
        
        // 먼저 페이지를 다시 스크롤해서 새로운 버튼들 로드
        await this.page.evaluate(() => {
          // 더 적극적인 스크롤
          window.scrollBy(0, window.innerHeight / 2);
          // 잠깐 기다렸다가 위로도 스크롤
          setTimeout(() => {
            window.scrollBy(0, -window.innerHeight / 4);
          }, 1000);
        });
        await this.delay(3000);
        
        const clicked = await this.page.evaluate(() => {
          let clickCount = 0;
          
          // 더 다양한 셀렉터로 답글 더보기 버튼 찾기 (강화)
          const selectors = [
            'div.css-1idgi02-DivViewRepliesContainer',
            '[class*="ViewReplies"]',
            '[data-e2e*="view-replies"]',
            'div[role="button"]',
            '[class*="view-replies"]',
            '[class*="ViewMore"]',
            '[class*="more-replies"]',
            'span[class*="view"]',
            'div[class*="replies"]',
            '[class*="DivViewReplies"]'
          ];
          
          const allButtons = [];
          selectors.forEach(selector => {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(btn => allButtons.push(btn));
          });
          
          // 중복 제거
          const uniqueButtons = [...new Set(allButtons)];
          
          uniqueButtons.forEach(button => {
            try {
              const text = button.textContent || button.innerText || '';
              const lowerText = text.toLowerCase();
              
              // 더 유연한 패턴 매칭
              const isViewMoreButton = (
                (lowerText.includes('view') && (lowerText.includes('replies') || lowerText.includes('more'))) ||
                (lowerText.includes('답글') && lowerText.includes('보기')) ||
                lowerText.includes('view') && /\d+/.test(lowerText) ||
                /view\s*\d+/.test(lowerText)
              ) && !lowerText.includes('hide') && !lowerText.includes('숨기');
              
              if (isViewMoreButton) {
                // 버튼이 화면에 보이는지 확인
                const rect = button.getBoundingClientRect();
                const isVisible = rect.top >= 0 && rect.top <= window.innerHeight;
                
                if (isVisible) {
                  // 버튼을 중앙으로 스크롤
                  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  
                  // 잠깐 기다린 후 클릭
                  setTimeout(() => {
                    try {
                      button.click();
                      console.log(`✅ 답글 더보기 버튼 클릭: "${text.trim()}"`);
                    } catch (e) {
                      console.log(`❌ 버튼 클릭 실패: ${e.message}`);
                    }
                  }, 500);
                  
                  clickCount++;
                }
              }
            } catch (e) {
              console.log(`❌ 버튼 처리 실패: ${e.message}`);
            }
          });
          
          return clickCount;
        });
        
        if (clicked === 0) {
          // 한 번 더 스크롤해서 확인
          await this.page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
          });
          await this.delay(3000);
          
          const secondCheck = await this.page.evaluate(() => {
            const buttons = document.querySelectorAll('div.css-1idgi02-DivViewRepliesContainer, [class*="ViewReplies"]');
            return buttons.length;
          });
          
          if (secondCheck === 0) {
            console.log(`💡 더 이상 클릭할 답글 더보기 버튼이 없습니다.`);
            break;
          }
        } else {
          console.log(`🔘 ${clicked}개 답글 더보기 버튼 클릭됨`);
          totalClicked += clicked;
        }
        
        // 클릭 후 답글 로딩 대기
        await this.delay(3000); // 답글 로딩을 위한 충분한 대기
      }
      
      console.log(`✅ 총 ${totalClicked}개 답글 더보기 버튼 클릭됨`);
    } catch (error) {
      console.log('⚠️ 버튼 클릭 중 오류:', error.message);
    }
  }

  /**
   * 모든 댓글 추출 (강화된 버전)
   */
  async extractAllComments() {
    try {
      // 디버깅 스크린샷 제거됨
      
      const comments = await this.page.evaluate(() => {
        const results = [];
        const seenUsernames = new Set(); // 중복 제거용
        const duplicateCount = { main: 0, reply: 0, total: 0 }; // 중복 통계
        
        console.log('=== 댓글 추출 디버깅 시작 ===');
        
        // 다양한 댓글 셀렉터 시도
        const possibleSelectors = [
          'span[data-e2e="comment-level-1"]',
          'span[data-e2e="comment-level-2"]',
          '[data-e2e*="comment"]',
          'div[class*="CommentObject"]',
          'div[class*="Comment"]',
          'div.css-13wx63w-DivCommentObjectWrapper',
          'div.css-1gstnae-DivCommentItemWrapper'
        ];
        
        // 각 셀렉터별 발견된 요소 수 체크
        possibleSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          console.log(`${selector}: ${elements.length}개 발견`);
        });
        
        // 1. 메인 댓글 찾기 (여러 방법 시도)
        let mainCommentElements = [];
        
        // 방법 1: data-e2e 속성으로 찾기
        mainCommentElements = document.querySelectorAll('span[data-e2e="comment-level-1"]');
        console.log(`방법 1 - 메인 댓글 span 발견: ${mainCommentElements.length}개`);
        
        // 방법 2: 댓글 컨테이너에서 직접 찾기
        if (mainCommentElements.length === 0) {
          const commentContainers = document.querySelectorAll('div[class*="CommentObject"], div.css-13wx63w-DivCommentObjectWrapper');
          console.log(`방법 2 - 댓글 컨테이너 발견: ${commentContainers.length}개`);
          
          commentContainers.forEach((container, index) => {
            try {
              const usernameLink = container.querySelector('a[href*="/@"]');
              if (usernameLink) {
                const username = usernameLink.textContent.trim();
                
                if (username && username.length > 0) {
                  // 중복 체크 (통계용)
                  if (seenUsernames.has(username)) {
                    duplicateCount.main++;
                    duplicateCount.total++;
                    console.log(`중복 메인 댓글 발견 (수집함): ${username}`);
                  } else {
                    seenUsernames.add(username);
                  }
                  
                  // 중복 제거 임시 비활성화 - 모든 댓글 수집
                  results.push({
                    index: results.length + 1,
                    username: username,
                    userUrl: usernameLink.href,
                    type: 'main',
                    isDuplicate: seenUsernames.has(username) // 중복 여부 표시
                  });
                  
                  console.log(`컨테이너 방법으로 메인 댓글 추가: ${username}`);
                }
              }
            } catch (error) {
              console.error(`컨테이너 ${index} 처리 오류:`, error.message);
            }
          });
        } else {
          // 기존 방법으로 메인 댓글 처리
          mainCommentElements.forEach((commentSpan, index) => {
            try {
              const commentWrapper = commentSpan.closest('div.css-13wx63w-DivCommentObjectWrapper') || 
                                   commentSpan.closest('div[class*="CommentObject"]') ||
                                   commentSpan.parentElement.closest('div');
              
              if (commentWrapper) {
                const usernameLink = commentWrapper.querySelector('a[href*="/@"]');
                
                if (usernameLink) {
                  const username = usernameLink.textContent.trim();
                  
                  if (username && username.length > 0) {
                    // 중복 체크 (통계용)
                    const wasDuplicate = seenUsernames.has(username);
                    if (wasDuplicate) {
                      duplicateCount.main++;
                      duplicateCount.total++;
                      console.log(`중복 메인 댓글 발견 (수집함): ${username}`);
                    } else {
                      seenUsernames.add(username);
                    }
                    
                    // 댓글 내용 추출 시도
                    let commentText = '';
                    const textElements = commentWrapper.querySelectorAll('span, p');
                    textElements.forEach(el => {
                      const text = el.textContent.trim();
                      if (text && text !== username && text.length > 2 && text.length < 500) {
                        if (!commentText || text.length > commentText.length) {
                          commentText = text;
                        }
                      }
                    });
                    
                    // 중복 제거 임시 비활성화 - 모든 댓글 수집
                    results.push({
                      index: results.length + 1,
                      username: username,
                      userUrl: usernameLink.href,
                      commentText: commentText,
                      type: 'main',
                      isDuplicate: wasDuplicate
                    });
                    
                    console.log(`메인 댓글 추가: ${username} - "${commentText.substring(0, 50)}..."`);
                  }
                }
              }
            } catch (error) {
              console.error(`메인 댓글 ${index} 처리 오류:`, error.message);
            }
          });
        }
        
        // 2. 답글 찾기 (여러 방법 시도)
        let replyElements = document.querySelectorAll('span[data-e2e="comment-level-2"]');
        console.log(`답글 span 발견: ${replyElements.length}개`);
        
        replyElements.forEach((replySpan, index) => {
          try {
            const replyWrapper = replySpan.closest('div.css-1gstnae-DivCommentItemWrapper') ||
                               replySpan.closest('div[class*="Reply"]') ||
                               replySpan.parentElement.closest('div');
            
            if (replyWrapper) {
              const usernameLink = replyWrapper.querySelector('a[href*="/@"]');
              
              if (usernameLink) {
                const username = usernameLink.textContent.trim();
                
                if (username && username.length > 0) {
                  // 중복 체크 (통계용)
                  const wasDuplicate = seenUsernames.has(username);
                  if (wasDuplicate) {
                    duplicateCount.reply++;
                    duplicateCount.total++;
                    console.log(`중복 답글 발견 (수집함): ${username}`);
                  } else {
                    seenUsernames.add(username);
                  }
                  
                  // 답글 내용 추출 시도
                  let commentText = '';
                  const textElements = replyWrapper.querySelectorAll('span, p');
                  textElements.forEach(el => {
                    const text = el.textContent.trim();
                    if (text && text !== username && text.length > 2 && text.length < 500) {
                      if (!commentText || text.length > commentText.length) {
                        commentText = text;
                      }
                    }
                  });
                  
                  // 중복 제거 임시 비활성화 - 모든 댓글 수집
                  results.push({
                    index: results.length + 1,
                    username: username,
                    userUrl: usernameLink.href,
                    commentText: commentText,
                    type: 'reply',
                    isDuplicate: wasDuplicate
                  });
                  
                  console.log(`답글 추가: ${username} - "${commentText.substring(0, 30)}..."`);
                }
              }
            }
          } catch (error) {
            console.error(`답글 ${index} 처리 오류:`, error.message);
          }
        });
        
        // 3. 대체 방법: 모든 사용자 링크에서 댓글 찾기
        if (results.length < 10) { // 기존 방법으로 충분히 찾지 못했을 때만 실행
          console.log('대체 방법 시도: 모든 사용자 링크 확인');
          const allUserLinks = document.querySelectorAll('a[href*="/@"]');
          console.log(`전체 사용자 링크 발견: ${allUserLinks.length}개`);
          
          allUserLinks.forEach((link, index) => {
            try {
              const username = link.textContent.trim();
              
              // 더 넓은 범위에서 댓글 컨테이너 찾기
              const commentContainer = link.closest('div[class*="Comment"], div[class*="comment"], div[data-e2e*="comment"], div[class*="Object"]');
              
              if (commentContainer && username && username.length > 0) {
                // 중복 체크 (통계용)
                const wasDuplicate = seenUsernames.has(username);
                if (wasDuplicate) {
                  duplicateCount.total++;
                  console.log(`중복 댓글 발견 (대체방법, 수집함): ${username}`);
                } else {
                  seenUsernames.add(username);
                }
                
                // 댓글 레벨 추정하기
                let estimatedType = 'main';
                
                // 답글인지 확인하는 여러 방법
                const isReply = link.closest('div[class*="Reply"]') || 
                               link.closest('div.css-1gstnae-DivCommentItemWrapper') ||
                               commentContainer.querySelector('[data-e2e="comment-level-2"]') ||
                               (link.getBoundingClientRect().left > 50); // 들여쓰기로 답글 추정
                
                if (isReply) {
                  estimatedType = 'reply';
                }
                
                // 댓글 내용 추출 시도
                let commentText = '';
                const textElements = commentContainer.querySelectorAll('span, p');
                textElements.forEach(el => {
                  const text = el.textContent.trim();
                  if (text && text !== username && text.length > 2 && text.length < 500) {
                    if (!commentText || text.length > commentText.length) {
                      commentText = text;
                    }
                  }
                });
                
                // 중복 제거 임시 비활성화 - 모든 댓글 수집
                results.push({
                  index: results.length + 1,
                  username: username,
                  userUrl: link.href,
                  commentText: commentText,
                  type: estimatedType,
                  isDuplicate: wasDuplicate
                });
                
                console.log(`대체 방법으로 ${estimatedType} 댓글 추가: ${username} - "${commentText.substring(0, 30)}..."`);
              }
            } catch (error) {
              console.error(`대체 방법 ${index} 처리 오류:`, error.message);
            }
          });
        }
        
        console.log(`\n=== 수집 완료 통계 (중복 제거 비활성화) ===`);
        console.log(`📊 총 수집된 댓글: ${results.length}개`);
        console.log(`🔄 중복 발견: ${duplicateCount.total}개 (메인: ${duplicateCount.main}, 답글: ${duplicateCount.reply})`);
        console.log(`👥 고유 사용자: ${results.length - duplicateCount.total}명`);
        
        return { comments: results, duplicateStats: duplicateCount };
      });
      
      const extractedComments = comments.comments || comments;
      const duplicateStats = comments.duplicateStats || { main: 0, reply: 0, total: 0 };
      
      const mainComments = extractedComments.filter(c => c.type === 'main');
      const replies = extractedComments.filter(c => c.type === 'reply');
      const unknownComments = extractedComments.filter(c => c.type === 'unknown');
      
      console.log(`📊 메인 댓글: ${mainComments.length}개, 답글: ${replies.length}개, 기타: ${unknownComments.length}개`);
      
      return {
        mainComments,
        replies,
        allComments: extractedComments,
        total: extractedComments.length,
        duplicateStats
      };
      
    } catch (error) {
      console.error('댓글 추출 중 오류:', error.message);
      return { mainComments: [], replies: [], allComments: [], total: 0 };
    }
  }

  /**
   * 댓글 데이터를 JSON 파일로 저장
   */
  async saveCommentsToFile(comments, postUrl) {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const timestamp = Date.now();
      const urlParts = postUrl.split('/');
      const videoId = urlParts[urlParts.length - 1];
      
      const filename = `tiktok_comments_${videoId}_${timestamp}.json`;
      const filepath = path.join(__dirname, '..', 'output', filename);
      
      const data = {
        postUrl,
        scrapedAt: new Date().toISOString(),
        timing: comments.timing || {},
        stats: {
          totalMainComments: comments.mainComments ? comments.mainComments.length : 0,
          totalReplies: comments.replies ? comments.replies.length : 0,
          totalUniqueUsers: comments.total || 0,
          duplicatesRemoved: comments.duplicateStats?.total || 0,
          totalProcessed: (comments.total || 0) + (comments.duplicateStats?.total || 0)
        },
        duplicateStats: comments.duplicateStats || { main: 0, reply: 0, total: 0 },
        mainComments: comments.mainComments || [],
        replies: comments.replies || [],
        allComments: comments.allComments || []
      };
      
      await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
      
      console.log(`💾 댓글 데이터 저장 완료: ${filename}`);
      return filepath;
      
    } catch (error) {
      console.error('댓글 데이터 저장 중 오류:', error.message);
      return null;
    }
  }

  /**
   * 브라우저 종료
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log('🔒 브라우저 종료');
      }
    } catch (error) {
      console.error('브라우저 종료 오류:', error.message);
    }
  }

  /**
   * 지연 함수
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 진짜 스트림 방식: 댓글이 나타나는 즉시 저장
   * @param {number} maxComments - 최대 댓글 수
   */
  async realTimeCommentStream(maxComments) {
    try {
      let processedComments = new Set(); // 중복 방지
      let lastCommentCount = 0;
      let noNewCommentsCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 50;
      
      console.log(`🎯 실시간 스트림 목표: ${maxComments}개 댓글`);
      
      while (this.savedCommentsCount < maxComments && scrollAttempts < maxScrollAttempts) {
        const cycleStart = Date.now();
        
        // 1단계: 현재 보이는 댓글들 즉시 저장
        const newlySaved = await this.extractAndSaveVisibleComments(processedComments, maxComments);
        if (newlySaved > 0) {
          console.log(`💾 실시간 저장: +${newlySaved}개 (총 ${this.savedCommentsCount}/${maxComments})`);
          noNewCommentsCount = 0; // 새 댓글이 있으면 카운터 리셋
        }
        
        // 🎯 목표 달성 시 즉시 중단
        if (this.savedCommentsCount >= maxComments) {
          console.log(`🎉 목표 달성! ${this.savedCommentsCount}/${maxComments}개 저장 완료`);
          break;
        }
        
        // 2단계: 답글 더보기 버튼 클릭 (제한 체크 포함)
        const clickedReplies = await this.clickViewMoreButtonsWithLimit(maxComments);
        if (clickedReplies > 0) {
          console.log(`🔘 답글 더보기 ${clickedReplies}개 클릭`);
          await this.delay(2000); // 답글 로딩 대기
          
          // 답글 로딩 후 즉시 저장
          const replySaved = await this.extractAndSaveVisibleComments(processedComments, maxComments);
          if (replySaved > 0) {
            console.log(`💾 답글 실시간 저장: +${replySaved}개 (총 ${this.savedCommentsCount}/${maxComments})`);
          }
        }
        
        // 🎯 목표 달성 시 즉시 중단
        if (this.savedCommentsCount >= maxComments) {
          console.log(`🎉 목표 달성! ${this.savedCommentsCount}/${maxComments}개 저장 완료`);
          break;
        }
        
        // 3단계: 스크롤해서 더 많은 댓글 로딩
        await this.smartScroll(scrollAttempts);
        await this.delay(2000); // 스크롤 후 로딩 대기
        
        // 스크롤 후 즉시 저장
        const scrollSaved = await this.extractAndSaveVisibleComments(processedComments, maxComments);
        if (scrollSaved > 0) {
          console.log(`💾 스크롤 후 저장: +${scrollSaved}개 (총 ${this.savedCommentsCount}/${maxComments})`);
        }
        
        // 🎯 목표 달성 시 즉시 중단
        if (this.savedCommentsCount >= maxComments) {
          console.log(`🎉 목표 달성! ${this.savedCommentsCount}/${maxComments}개 저장 완료`);
          break;
        }
        
        // 4단계: 진행상황 체크
        const currentCommentCount = await this.getCurrentCommentCount();
        if (currentCommentCount === lastCommentCount) {
          noNewCommentsCount++;
          if (noNewCommentsCount >= 5) {
            console.log('🛑 5번 연속 새 댓글 없음 - 종료');
            break;
          }
        } else {
          lastCommentCount = currentCommentCount;
          noNewCommentsCount = 0;
        }
        
        // 종료 신호 감지
        const isEnd = await this.detectEndSignal();
        if (isEnd) {
          console.log('🛑 댓글 로딩 완료 신호 감지');
          break;
        }
        
        scrollAttempts++;
        
        // 진행률 출력 (매 5번마다)
        if (scrollAttempts % 5 === 0) {
          const progress = Math.round((this.savedCommentsCount / maxComments) * 100);
          console.log(`📊 진행률: ${progress}% (${this.savedCommentsCount}/${maxComments}) - 시도 ${scrollAttempts}/${maxScrollAttempts}`);
        }
        
        // 페이지 활성화 유지
        if (scrollAttempts % 3 === 0) {
          await this.page.bringToFront();
        }
        
        const cycleTime = Date.now() - cycleStart;
        console.log(`⏱️ 사이클 ${scrollAttempts}: ${cycleTime}ms`);
      }
      
      console.log(`✅ 실시간 스트림 완료: ${this.savedCommentsCount}개 저장 (${scrollAttempts}번 시도)`);
      
    } catch (error) {
      console.error('실시간 스트림 오류:', error.message);
    }
  }

  /**
   * 현재 보이는 댓글들을 즉시 추출하고 저장 (제한 체크 포함)
   * @param {Set} processedComments - 처리된 댓글 목록
   * @param {number} maxComments - 최대 댓글 수
   * @returns {number} 새로 저장된 댓글 수
   */
  async extractAndSaveVisibleComments(processedComments, maxComments) {
    try {
      // 🎯 제한 체크
      if (this.savedCommentsCount >= maxComments) {
        return 0;
      }
      
      const visibleComments = await this.page.evaluate(() => {
        const comments = [];
        
        // 브라우저 컨텍스트용 댓글 추출 함수
        function extractSingleComment(element, type) {
          try {
            const comment = {
              type: type,
              text: '',
              author_username: '',
              author_display_name: '',
              like_count: 0,
              reply_count: 0,
              parent_comment_id: null
            };
            
            // 댓글 텍스트 추출
            const textElement = element.querySelector('span[data-e2e="comment-text"]') || element;
            comment.text = textElement.textContent || textElement.innerText || '';
            
            // 작성자 정보 추출
            const commentContainer = element.closest('[data-e2e*="comment"]') || element.parentElement;
            if (commentContainer) {
              const authorLink = commentContainer.querySelector('a[data-e2e="comment-username"]');
              if (authorLink) {
                comment.author_username = authorLink.textContent || authorLink.innerText || '';
                comment.author_display_name = comment.author_username;
              }
              
              // 좋아요 수 추출
              const likeElement = commentContainer.querySelector('[data-e2e="comment-like-count"]');
              if (likeElement) {
                const likeText = likeElement.textContent || likeElement.innerText || '0';
                comment.like_count = parseInt(likeText.replace(/[^0-9]/g, '')) || 0;
              }
            }
            
            return comment;
          } catch (e) {
            return null;
          }
        }
        
        // 모든 댓글 요소 스캔
        const allCommentElements = document.querySelectorAll('span[data-e2e^="comment-level"]');
        allCommentElements.forEach(element => {
          try {
            const level = element.getAttribute('data-e2e').includes('level-1') ? 'main' : 'reply';
            const comment = extractSingleComment(element, level);
            if (comment && comment.text.trim()) {
              comments.push(comment);
            }
          } catch (e) {
            // 무시
          }
        });
        
        return comments;
      });
      
      // 새로운 댓글만 필터링하고 즉시 저장
      let savedCount = 0;
      for (const comment of visibleComments) {
        // 🎯 제한 체크
        if (this.savedCommentsCount >= maxComments) {
          console.log(`🎯 제한 도달로 저장 중단: ${this.savedCommentsCount}/${maxComments}`);
          break;
        }
        
        const commentKey = `${comment.author_username}_${comment.text.substring(0, 50)}_${comment.type}`;
        
        if (!processedComments.has(commentKey)) {
          processedComments.add(commentKey);
          
          // 즉시 데이터베이스에 저장
          const success = await this.saveCommentToDatabase(comment);
          if (success) {
            savedCount++;
            this.savedCommentsCount++;
            
            // 실시간 피드백
            if (savedCount % 5 === 0 || this.savedCommentsCount % 10 === 0) {
              console.log(`  ⚡ 실시간: ${comment.type} "${comment.text.substring(0, 30)}..." by @${comment.author_username}`);
            }
          }
        }
      }
      
      return savedCount;
      
    } catch (error) {
      console.error('댓글 실시간 저장 오류:', error.message);
      return 0;
    }
  }

  /**
   * 제한을 고려한 답글 더보기 버튼 클릭
   * @param {number} maxComments - 최대 댓글 수
   * @returns {number} 클릭한 버튼 수
   */
  async clickViewMoreButtonsWithLimit(maxComments) {
    try {
      // 🎯 제한 체크
      if (this.savedCommentsCount >= maxComments) {
        console.log(`🎯 제한 도달로 더보기 버튼 클릭 중단: ${this.savedCommentsCount}/${maxComments}`);
        return 0;
      }
      
      const clicked = await this.page.evaluate(() => {
        let clickCount = 0;
        
        const selectors = [
          'div.css-1idgi02-DivViewRepliesContainer',
          '[class*="ViewReplies"]',
          '[data-e2e*="view-replies"]',
          'div[role="button"]',
          '[class*="view-replies"]'
        ];
        
        const allButtons = [];
        selectors.forEach(selector => {
          const buttons = document.querySelectorAll(selector);
          buttons.forEach(btn => allButtons.push(btn));
        });
        
        const uniqueButtons = [...new Set(allButtons)];
        
        uniqueButtons.forEach(button => {
          try {
            const text = button.textContent || button.innerText || '';
            const lowerText = text.toLowerCase();
            
            const isViewMoreButton = (
              (lowerText.includes('view') && lowerText.includes('replies')) ||
              (lowerText.includes('답글') && lowerText.includes('보기'))
            ) && !lowerText.includes('hide');
            
            if (isViewMoreButton) {
              const rect = button.getBoundingClientRect();
              const isVisible = rect.top >= 0 && rect.top <= window.innerHeight;
              
              if (isVisible) {
                button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                  try {
                    button.click();
                    clickCount++;
                  } catch (e) {
                    // 무시
                  }
                }, 300);
              }
            }
          } catch (e) {
            // 무시
          }
        });
        
        return clickCount;
      });
      
      return clicked;
      
    } catch (error) {
      console.error('답글 더보기 버튼 클릭 오류:', error.message);
      return 0;
    }
  }

  /**
   * 스마트 스크롤 (다양한 패턴 사용)
   * @param {number} attempt - 시도 횟수
   */
  async smartScroll(attempt) {
    try {
      await this.page.evaluate((attemptNum) => {
        const pattern = attemptNum % 4;
        
        if (pattern === 0) {
          // 큰 단위 스크롤
          window.scrollBy(0, window.innerHeight * 1.5);
        } else if (pattern === 1) {
          // 작은 단위 여러 번
          for (let i = 0; i < 3; i++) {
            setTimeout(() => window.scrollBy(0, window.innerHeight / 3), i * 200);
          }
        } else if (pattern === 2) {
          // 끝까지 스크롤 후 조금 위로
          window.scrollTo(0, document.body.scrollHeight);
          setTimeout(() => window.scrollBy(0, -window.innerHeight / 3), 500);
        } else {
          // 기본 스크롤
          window.scrollBy(0, window.innerHeight);
        }
      }, attempt);
      
    } catch (error) {
      console.error('스크롤 오류:', error.message);
    }
  }

  /**
   * 현재 페이지의 댓글 수 확인
   * @returns {number} 현재 댓글 수
   */
  async getCurrentCommentCount() {
    try {
      return await this.page.evaluate(() => {
        const mainComments = document.querySelectorAll('span[data-e2e="comment-level-1"]');
        const replies = document.querySelectorAll('span[data-e2e="comment-level-2"]');
        return mainComments.length + replies.length;
      });
    } catch (error) {
      return 0;
    }
  }

  /**
   * 댓글 로딩 완료 신호 감지
   * @returns {boolean} 완료 신호 여부
   */
  async detectEndSignal() {
    try {
      return await this.page.evaluate(() => {
        const endSignals = [
          'word word word', 
          'no more comments',
          '더 이상 댓글이 없습니다',
          'end of comments'
        ];
        
        const bodyText = document.body.innerText.toLowerCase();
        return endSignals.some(signal => bodyText.includes(signal.toLowerCase()));
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * 개별 댓글을 데이터베이스에 저장
   * @param {Object} comment - 댓글 객체
   * @returns {boolean} 저장 성공 여부
   */
  async saveCommentToDatabase(comment) {
    if (!this.databaseService || !this.currentProfileId) {
      console.log('⚠️ 데이터베이스 서비스 또는 프로필 ID 없음');
      return false;
    }
    
    try {
      // 댓글 데이터를 최소 정보로 변환 (팔로워 매칭용)
      const commentData = {
        post_url: this.currentPostUrl,           // ✅ 어떤 게시물에
        influencer_id: this.currentProfileId,   // ✅ 어떤 인플루언서의
        author_username: comment.author_username // ✅ 누가 댓글 달았는지
        // 나머지 정보는 팔로워 매칭에 불필요하므로 제거
      };
      
      // 데이터베이스에 저장
      const savedCommentId = await this.databaseService.saveComment(commentData);
      
      if (savedCommentId) {
        return true;
      } else {
        console.log(`❌ 댓글 저장 실패: ${comment.author_username} - ${comment.text.substring(0, 30)}...`);
        return false;
      }
      
    } catch (error) {
      console.error('댓글 저장 오류:', error.message);
      return false;
    }
  }
}

module.exports = TikTokCommentScraper; 