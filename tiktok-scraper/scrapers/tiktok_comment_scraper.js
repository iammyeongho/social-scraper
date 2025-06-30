const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config').tiktok;

puppeteer.use(StealthPlugin());

/**
 * 강화된 틱톡 댓글 스크래퍼
 * 게시물의 댓글과 답글을 효율적으로 수집
 */
class TikTokCommentScraper {
  constructor() {
    this.browser = null;
    this.page = null;
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
   * 틱톡 게시물의 댓글 스크래핑 (강화된 버전)
   * @param {string} postUrl - 게시물 URL
   * @param {number} maxComments - 수집할 최대 댓글 수 (기본값: 50)
   * @returns {Promise<Object>} 댓글 데이터 객체
   */
  async scrapeComments(postUrl, maxComments = 1000) { // 최대 1000개로 증가
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
      console.log(`📝 총 수집된 댓글: ${comments.total}개 (중복 포함)`);
      console.log(`👥 고유 사용자: ${comments.total - (comments.duplicateStats?.total || 0)}명`);
      
      // 시간 정보를 댓글 데이터에 추가
      comments.timing = {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        startTimestamp,
        endTimestamp,
        durationMs: duration,
        durationMinutes
      };
      
      return comments;
      
    } catch (error) {
      console.error('❌ 스크래핑 오류:', error.message);
      
      try {
        await this.page.screenshot({ 
          path: `error_${Date.now()}.png`,
          fullPage: true 
        });
        console.log('📸 오류 스크린샷 저장됨');
      } catch (e) {}
      
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
      
      while (loadedComments < maxComments && scrollAttempts < maxScrollAttempts) {
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
      // 페이지 스크린샷으로 디버깅
      await this.page.screenshot({ 
        path: `debug_extract_${Date.now()}.png`,
        fullPage: true 
      });
      
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
}

module.exports = TikTokCommentScraper; 