const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { setTimeout: sleep } = require('node:timers/promises');
const config = require('../config').instagram;

puppeteer.use(StealthPlugin());

/**
 * 인스타그램 자동 로그인 함수
 * @param {string} username - 사용자명
 * @param {string} password - 비밀번호
 * @returns {Promise<boolean>} - 로그인 성공 여부
 */
async function loginToInstagram(username, password) {
  const browser = await puppeteer.launch(config.loggedInBrowser);
  const page = await browser.newPage();
  
  try {
    console.log('인스타그램 로그인을 시작합니다...');
    
    // 인스타그램 로그인 페이지로 이동
    await page.goto('https://www.instagram.com/accounts/login/', { 
      waitUntil: 'networkidle2' 
    });
    await sleep(2000);

    // 로그인 폼 입력
    await page.type('input[name="username"]', username);
    await page.type('input[name="password"]', password);
    
    // 로그인 버튼 클릭
    await page.click('button[type="submit"]');
    await sleep(3000);

    // 로그인 성공 확인
    const isLoggedIn = await page.evaluate(() => {
      const loginButton = document.querySelector('button[type="submit"]');
      const profileButton = document.querySelector('a[href="/accounts/activity/"]');
      return !loginButton && profileButton;
    });

    if (isLoggedIn) {
      console.log('✅ 로그인 성공!');
      await sleep(2000);
      await browser.close();
      return true;
    } else {
      console.log('❌ 로그인 실패');
      await browser.close();
      return false;
    }

  } catch (error) {
    console.error('로그인 중 오류 발생:', error.message);
    await browser.close();
    return false;
  }
}

/**
 * 로그인 상태 확인 함수
 * @returns {Promise<boolean>} - 로그인 상태
 */
async function checkLoginStatus() {
  const browser = await puppeteer.launch(config.loggedInBrowser);
  const page = await browser.newPage();
  
  try {
    await page.goto('https://www.instagram.com/', { 
      waitUntil: 'networkidle2' 
    });
    await sleep(2000);

    const isLoggedIn = await page.evaluate(() => {
      const loginButton = document.querySelector('button[type="submit"]');
      const profileButton = document.querySelector('a[href="/accounts/activity/"]');
      return !loginButton && profileButton;
    });

    await browser.close();
    return isLoggedIn;

  } catch (error) {
    console.error('로그인 상태 확인 중 오류:', error.message);
    await browser.close();
    return false;
  }
}

/**
 * 인스타그램 로그인 세션 유지 스크립트
 * 크롬 프로필을 사용해 로그인 상태를 유지합니다.
 */
async function maintainInstagramSession() {
  let browser;
  
  try {
    console.log('=== 인스타그램 로그인 세션 유지 시작 ===');
    
    // 크롬 프로필을 사용해 브라우저 실행
    browser = await puppeteer.launch({
      ...config.browser,
      userDataDir: config.chromeProfilePath,
    });
    
    const page = await browser.newPage();
    
    // 모바일 에뮬레이션 설정
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    
    // 인스타그램 메인 페이지로 이동
    console.log('인스타그램 메인 페이지로 이동 중...');
    await page.goto('https://www.instagram.com/', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // 로그인 상태 확인
    const isLoggedIn = await checkLoginStatus(page);
    
    if (isLoggedIn) {
      console.log('✓ 이미 로그인된 상태입니다.');
      
      // 세션 유지를 위해 주기적으로 활동
      console.log('세션 유지를 위해 주기적으로 활동을 수행합니다...');
      
      // 프로필 페이지 방문
      await page.goto('https://www.instagram.com/accounts/activity/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      await page.waitForTimeout(3000);
      
      // 메인 피드 방문
      await page.goto('https://www.instagram.com/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      console.log('✓ 세션 유지 활동 완료');
      
    } else {
      console.log('로그인이 필요합니다.');
      
      // 환경변수에서 로그인 정보 확인
      const username = process.env.INSTAGRAM_USERNAME;
      const password = process.env.INSTAGRAM_PASSWORD;
      
      if (!username || !password) {
        console.log('환경변수 INSTAGRAM_USERNAME과 INSTAGRAM_PASSWORD를 설정해주세요.');
        console.log('또는 브라우저에서 수동으로 로그인해주세요.');
        
        // 브라우저를 열어두고 수동 로그인 대기
        console.log('브라우저가 열려있습니다. 수동으로 로그인한 후 Enter를 눌러주세요...');
        await new Promise(resolve => {
          process.stdin.once('data', resolve);
        });
        
        // 로그인 상태 재확인
        const loginCheck = await checkLoginStatus(page);
        if (loginCheck) {
          console.log('✓ 로그인 성공!');
        } else {
          console.log('✗ 로그인 실패');
        }
      } else {
        // 자동 로그인 시도
        console.log('자동 로그인을 시도합니다...');
        const loginSuccess = await performAutoLogin(page, username, password);
        
        if (loginSuccess) {
          console.log('✓ 자동 로그인 성공!');
        } else {
          console.log('✗ 자동 로그인 실패');
        }
      }
    }
    
    // 세션 정보 출력
    await printSessionInfo(page);
    
    console.log('\n=== 세션 유지 완료 ===');
    console.log('브라우저를 닫지 마시고 스크래핑 작업을 진행하세요.');
    console.log('Ctrl+C로 종료할 수 있습니다.');
    
    // 브라우저를 열어둔 상태로 유지
    await new Promise(() => {}); // 무한 대기
    
  } catch (error) {
    console.error('세션 유지 중 오류 발생:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 로그인 상태 확인
 */
async function checkLoginStatus(page) {
  try {
    // 로그인 상태를 확인할 수 있는 요소들
    const loginIndicators = [
      'a[href="/accounts/activity/"]', // 활동 버튼
      'a[href="/accounts/edit/"]', // 프로필 편집 버튼
      'nav a[href="/"]', // 네비게이션의 홈 버튼
    ];
    
    for (const selector of loginIndicators) {
      const element = await page.$(selector);
      if (element) {
        return true;
      }
    }
    
    // 로그인 폼이 있는지 확인
    const loginForm = await page.$('form[action="/accounts/login/ajax/"]');
    return !loginForm;
    
  } catch (error) {
    console.error('로그인 상태 확인 오류:', error.message);
    return false;
  }
}

/**
 * 자동 로그인 수행
 */
async function performAutoLogin(page, username, password) {
  try {
    // 로그인 폼 대기
    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await page.waitForSelector('input[name="password"]', { timeout: 10000 });
    
    // 로그인 정보 입력
    await page.type('input[name="username"]', username);
    await page.type('input[name="password"]', password);
    
    // 로그인 버튼 클릭
    await page.click('button[type="submit"]');
    
    // 로그인 완료 대기
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    
    // 로그인 성공 확인
    return await checkLoginStatus(page);
    
  } catch (error) {
    console.error('자동 로그인 오류:', error.message);
    return false;
  }
}

/**
 * 세션 정보 출력
 */
async function printSessionInfo(page) {
  try {
    const cookies = await page.cookies();
    const sessionCookie = cookies.find(c => c.name === 'sessionid');
    const csrfCookie = cookies.find(c => c.name === 'csrftoken');
    
    console.log('\n=== 세션 정보 ===');
    console.log(`세션 쿠키: ${sessionCookie ? '있음' : '없음'}`);
    console.log(`CSRF 토큰: ${csrfCookie ? '있음' : '없음'}`);
    console.log(`총 쿠키 수: ${cookies.length}개`);
    
    if (sessionCookie) {
      console.log('✓ 로그인 세션이 유지되고 있습니다.');
    } else {
      console.log('✗ 로그인 세션이 없습니다.');
    }
    
  } catch (error) {
    console.error('세션 정보 출력 오류:', error.message);
  }
}

// 스크립트 실행
if (require.main === module) {
  maintainInstagramSession().catch(console.error);
}

module.exports = {
  loginToInstagram,
  checkLoginStatus,
  maintainInstagramSession,
  performAutoLogin,
  printSessionInfo
}; 