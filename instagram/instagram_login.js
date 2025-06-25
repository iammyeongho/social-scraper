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

module.exports = {
  loginToInstagram,
  checkLoginStatus
};

// 직접 실행 시 테스트
if (require.main === module) {
  (async () => {
    console.log('로그인 상태 확인 중...');
    const isLoggedIn = await checkLoginStatus();
    
    if (isLoggedIn) {
      console.log('이미 로그인되어 있습니다.');
    } else {
      console.log('로그인이 필요합니다.');
      console.log('자동 로그인을 사용하려면 config/instagram.js의 dummyAccount 설정을 업데이트하세요.');
    }
  })();
} 