const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config').tiktok;

puppeteer.use(StealthPlugin());

/**
 * TikTok 팔로워 스크래퍼
 * 인플루언서의 팔로워 목록을 수집
 */
class TikTokFollowerScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * 브라우저 초기화
   */
  async initialize() {
    try {
      console.log('🚀 TikTok 팔로워 스크래퍼 초기화 중...');
      
      this.browser = await puppeteer.launch({
        headless: false, // 팔로워 목록은 헤드풀 모드 권장
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--lang=ko-KR,ko',
          '--disable-blink-features=AutomationControlled'
        ],
        defaultViewport: null
      });

      this.page = await this.browser.newPage();
      
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await this.page.setViewport({ width: 1920, height: 1080 });

      console.log('✅ 팔로워 스크래퍼 초기화 완료');
      return true;

    } catch (error) {
      console.error('❌ 팔로워 스크래퍼 초기화 오류:', error.message);
      return false;
    }
  }

  /**
   * TikTok 인플루언서의 팔로워 목록 스크래핑
   * @param {string} username - TikTok 사용자명
   * @param {number} maxFollowers - 수집할 최대 팔로워 수 (null이면 무제한)
   * @returns {Promise<Object>} 팔로워 데이터
   */
  async scrapeFollowers(username, maxFollowers = null) {
    const startTime = new Date();
    
    // 기본 제한값 설정 (maxFollowers가 null이거나 0이면 기본값 사용)
    if (!maxFollowers) {
      maxFollowers = 1000; // 기본 제한값
    }
    
    try {
      console.log(`\n👥 팔로워 스크래핑 시작: @${username}`);
      console.log(`🎯 목표 팔로워 수: ${maxFollowers.toLocaleString()}개`);
      
      // 1. 프로필 페이지로 이동
      const profileUrl = `https://www.tiktok.com/@${username}`;
      console.log('🌐 프로필 페이지 로딩 중...');
      await this.page.goto(profileUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      await this.delay(5000);
      
      // 2. 팔로워 버튼 클릭
      console.log('🔍 팔로워 버튼 찾는 중...');
      const clicked = await this.clickFollowersButton();
      
      if (!clicked) {
        throw new Error('팔로워 버튼을 클릭할 수 없습니다');
      }
      
      await this.delay(3000);
      
      // 3. 팔로워 목록 수집
      console.log('📋 팔로워 목록 수집 시작...');
      const followers = await this.extractFollowersFromModal(maxFollowers);
      
      const endTime = new Date();
      const duration = endTime - startTime;
      const durationMinutes = Math.round(duration / 60000 * 100) / 100;
      
      console.log(`\n✅ 팔로워 스크래핑 완료!`);
      console.log(`👥 수집된 팔로워: ${followers.length.toLocaleString()}명`);
      console.log(`⏱️ 소요 시간: ${durationMinutes}분`);
      console.log(`📊 평균 수집 속도: ${Math.round(followers.length / durationMinutes)}명/분`);
      if (maxFollowers && followers.length >= maxFollowers) {
        console.log(`🎯 목표 수량(${maxFollowers}명)에 도달하여 완료`);
      }
      
      return {
        username,
        followers,
        total_collected: followers.length,
        target_limit: maxFollowers,
        collection_rate: maxFollowers ? Math.round((followers.length / maxFollowers) * 100) : 100,
        scrape_time: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          duration_ms: duration,
          duration_minutes: durationMinutes
        }
      };
      
    } catch (error) {
      console.error('❌ 팔로워 스크래핑 오류:', error.message);
      return {
        username,
        followers: [],
        total_collected: 0,
        error: error.message
      };
    }
  }

  /**
   * 팔로워 버튼 클릭
   */
  async clickFollowersButton() {
    try {
      console.log('🔍 팔로워 버튼 찾는 중...');
      
      // 팔로워 버튼 클릭 (사용자가 제공한 선택자 사용)
      const followersClicked = await this.page.evaluate(() => {
        const followersElement = document.querySelector('[data-e2e="followers-count"]');
        if (followersElement) {
          console.log('✅ 팔로워 버튼 발견됨:', followersElement.textContent);
          followersElement.click();
          return true;
        } else {
          console.log('❌ 팔로워 버튼을 찾을 수 없음');
          // 다른 선택자들도 시도
          const alternativeSelectors = [
            'strong[title="Followers"]',
            '[data-e2e="followers"]',
            '.css-1ldzp5s-DivNumber strong[title*="Followers"]'
          ];
          
          for (const selector of alternativeSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              console.log(`✅ 대체 팔로워 버튼 발견: ${selector}`, element.textContent);
              element.click();
              return true;
            }
          }
        }
        return false;
      });
      
      if (followersClicked) {
        console.log('✅ 팔로워 버튼 클릭 성공');
        
        // 모달이 열릴 때까지 잠시 대기
        await this.delay(3000);
        
        // Followers 탭이 있는지 확인하고 클릭
        const followersTabClicked = await this.page.evaluate(() => {
          // 모달 내에서 Followers 탭 찾기
          const followersTab = document.querySelector('.css-h1t3qn-DivTabItem.edpgb5h5');
          if (followersTab && followersTab.textContent.includes('Followers')) {
            console.log('✅ Followers 탭 발견됨, 클릭 중...');
            followersTab.click();
            return true;
          }
          return false;
        });
        
        if (followersTabClicked) {
          console.log('✅ Followers 탭 클릭 성공');
          await this.delay(2000); // 탭 전환 대기
        }
        
        return true;
      }
      
      console.log('❌ 팔로워 버튼 클릭 실패');
      return false;
    } catch (error) {
      console.error('❌ 팔로워 버튼 클릭 오류:', error.message);
      return false;
    }
  }

  /**
   * 팔로워 목록 모달에서 데이터 추출
   */
  async extractFollowersFromModal(maxFollowers) {
    try {
      console.log('🔍 팔로워 모달 대기 중...');
      
      // 새로운 모달 구조에 맞게 선택자 수정
      try {
        await this.page.waitForSelector('section[role="dialog"][aria-modal="true"]', { timeout: 15000 });
        console.log('✅ 팔로워 모달 발견됨');
      } catch (error) {
        console.log('❌ 첫 번째 모달 선택자 실패, 대체 선택자 시도...');
        // 대체 선택자들 시도
        const alternativeModalSelectors = [
          '[data-e2e="follow-info-popup"]',
          '.css-1nihxxg-DivModalContainer.edpgb5h0',
          'section[role="dialog"]'
        ];
        
        let modalFound = false;
        for (const selector of alternativeModalSelectors) {
          try {
            await this.page.waitForSelector(selector, { timeout: 5000 });
            console.log(`✅ 대체 모달 발견됨: ${selector}`);
            modalFound = true;
            break;
          } catch (e) {
            console.log(`❌ 대체 선택자 실패: ${selector}`);
          }
        }
        
        if (!modalFound) {
          throw new Error('모든 모달 선택자 실패');
        }
      }
      
      // 추가로 팔로워 목록 컨테이너 대기
      try {
        await this.page.waitForSelector('.css-wq5jjc-DivUserListContainer.eorzdsw0', { timeout: 10000 });
        console.log('✅ 팔로워 목록 컨테이너 발견됨');
      } catch (error) {
        console.log('❌ 팔로워 목록 컨테이너를 찾을 수 없음, 페이지 상태 확인...');
        
        // 현재 페이지의 구조 디버깅
        const pageInfo = await this.page.evaluate(() => {
          return {
            url: window.location.href,
            title: document.title,
            modals: document.querySelectorAll('section[role="dialog"]').length,
            containers: document.querySelectorAll('[class*="UserListContainer"]').length,
            allSections: Array.from(document.querySelectorAll('section')).map(s => s.className)
          };
        });
        console.log('📊 페이지 정보:', pageInfo);
        
        throw error;
      }
      
      let allFollowers = [];
      let scrollAttempts = 0;
      const maxScrollAttempts = 50;
      
      while (scrollAttempts < maxScrollAttempts && (maxFollowers === null || allFollowers.length < maxFollowers)) {
        // 현재 보이는 팔로워들 추출 (실제 HTML 구조 사용)
        const currentFollowers = await this.page.evaluate(() => {
          // 실제 HTML 구조에 맞는 선택자 사용
          const container = document.querySelector('.css-wq5jjc-DivUserListContainer.eorzdsw0');
          
          if (!container) {
            console.log('❌ 팔로워 컨테이너를 찾을 수 없음');
            return [];
          }
          
          const listItems = container.querySelectorAll('li');
          const followers = [];
          console.log(`📋 발견된 팔로워 항목: ${listItems.length}개`);
          
          for (const item of listItems) {
            try {
              // 링크에서 사용자명 추출
              const linkElement = item.querySelector('a[href*="/@"]');
              if (!linkElement) continue;
              
              const href = linkElement.getAttribute('href');
              const username = href.replace('/@', '').split('?')[0];
              
              // 표시 이름 추출 (실제 클래스명 사용)
              const displayNameElement = item.querySelector('.css-k0d282-SpanNickname.es616eb6');
              const displayName = displayNameElement ? displayNameElement.textContent.trim() : '';
              
              // 아바타 이미지
              const avatarElement = item.querySelector('img.css-1zpj2q-ImgAvatar.e1e9er4e1');
              const avatarUrl = avatarElement ? avatarElement.getAttribute('src') : '';
              
              // 인증 배지 확인 (향후 추가 가능)
              const isVerified = false; // TikTok 팔로워 목록에서는 인증 배지 표시 안됨
              
              if (username && username !== '') {
                followers.push({
                  username,
                  display_name: displayName,
                  profile_url: `https://www.tiktok.com/@${username}`,
                  avatar_url: avatarUrl,
                  is_verified: isVerified,
                  scraped_at: new Date().toISOString()
                });
                console.log(`👤 팔로워 추가: @${username} (${displayName})`);
              }
            } catch (e) {
              console.log(`❌ 팔로워 항목 처리 오류: ${e.message}`);
              continue;
            }
          }
          
          return followers;
        });
        
        // 중복 제거하면서 추가
        const previousCount = allFollowers.length;
        for (const follower of currentFollowers) {
          if (!allFollowers.find(f => f.username === follower.username)) {
            allFollowers.push(follower);
          }
        }
        
        const newCount = allFollowers.length - previousCount;
        console.log(`스크롤 ${scrollAttempts + 1}: ${allFollowers.length}명 (새로 발견: ${newCount}명)`);
        
        if (newCount === 0) {
          console.log('더 이상 새로운 팔로워가 없습니다.');
          break;
        }
        
        // 스크롤 (실제 HTML 구조에 맞게 수정)
        await this.page.evaluate(() => {
          const container = document.querySelector('.css-wq5jjc-DivUserListContainer.eorzdsw0');
          if (container) {
            container.scrollTop += 1000;
            console.log(`📜 스크롤 실행: ${container.scrollTop}px`);
          } else {
            console.log('❌ 스크롤할 컨테이너를 찾을 수 없음');
          }
        });
        
        scrollAttempts++;
        await this.delay(2000);
      }
      
      return maxFollowers === null ? allFollowers : allFollowers.slice(0, maxFollowers);
      
    } catch (error) {
      console.error('팔로워 목록 추출 오류:', error.message);
      return [];
    }
  }

  /**
   * 리소스 정리
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
      console.log('✅ 팔로워 스크래퍼 정리 완료');
    } catch (error) {
      console.error('팔로워 스크래퍼 정리 오류:', error.message);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TikTokFollowerScraper;

// 직접 실행시 테스트
if (require.main === module) {
  async function test() {
    const scraper = new TikTokFollowerScraper();
    
    try {
      await scraper.initialize();
      
      // 테스트할 사용자명 (팔로워가 많고 공개 계정인 사용자)
      const username = 'jypapi'; // JYP - 팔로워가 적당히 있고 공개 계정
      
      const result = await scraper.scrapeFollowers(username, 100); // 100명만 테스트
      console.log('📊 결과:', JSON.stringify(result, null, 2));
      
    } catch (error) {
      console.error('테스트 오류:', error);
    } finally {
      await scraper.close();
    }
  }
  
  test();
} 