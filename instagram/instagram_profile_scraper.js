const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { setTimeout: sleep } = require('node:timers/promises');
const config = require('../config').instagram;

puppeteer.use(StealthPlugin());

function getRandomDelay(min = 700, max = 1800) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

(async () => {
  // 프로필 스크래핑은 로그인이 필요하므로 loggedInBrowser 설정 사용
  const browser = await puppeteer.launch(config.loggedInBrowser);

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  );
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  try {
    // 로그인 상태 확인 (향후 자동 로그인 기능 추가 예정)
    console.log('로그인된 브라우저로 프로필 스크래핑을 시작합니다...');
    
    const targetProfile = 'oha._.diet'; // 스크래핑할 프로필
    await page.goto(`https://www.instagram.com/${targetProfile}/`, { waitUntil: 'networkidle2' });
    await sleep(config.scraping.pageLoadDelay);

    // 로그인 상태 확인
    const isLoggedIn = await page.evaluate(() => {
      // 로그인 상태를 확인하는 요소들
      const loginButton = document.querySelector('button[type="submit"]');
      const profileButton = document.querySelector('a[href="/accounts/activity/"]');
      return !loginButton && profileButton;
    });

    if (!isLoggedIn) {
      console.log('⚠️ 로그인이 필요합니다. 수동으로 로그인 후 다시 실행해주세요.');
      console.log('향후 자동 로그인 기능이 추가될 예정입니다.');
      await sleep(10000); // 10초 대기 후 종료
      return;
    }

    console.log('✅ 로그인 상태 확인됨');

    // Infinite scroll & 게시물 a태그 수집
    let prevCount = 0;
    let sameCount = 0;
    let allLinks = new Set();
    let scrollAttempts = 0;

    while (sameCount < config.scraping.profile.sameCountThreshold && 
           scrollAttempts < config.scraping.profile.maxScrollAttempts) {
      
      // 현재 게시물 a태그 href 수집
      const links = await page.$$eval('a[role="link"]', as =>
        as
          .map(a => a.href)
          .filter(href => /\/(p|reel|tv)\//.test(href))
      );
      links.forEach(l => allLinks.add(l));

      // 스크롤 내리기 (조금씩, 랜덤)
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 0.7 + Math.random() * 100);
      });
      await sleep(getRandomDelay());

      // 새 게시물이 더 이상 안 나오면 sameCount++
      if (allLinks.size === prevCount) {
        sameCount++;
      } else {
        sameCount = 0;
        prevCount = allLinks.size;
      }
      
      scrollAttempts++;
      console.log(`스크롤 ${scrollAttempts}/${config.scraping.profile.maxScrollAttempts} - 수집된 게시물: ${allLinks.size}개`);
    }

    // 결과 출력
    console.log(`\n=== 프로필 스크래핑 결과 ===`);
    console.log(`대상 프로필: ${targetProfile}`);
    console.log(`수집된 게시글 수: ${allLinks.size}`);
    console.log(`스크롤 시도 횟수: ${scrollAttempts}`);
    console.log('\n게시물 URL 목록:');
    Array.from(allLinks).forEach((url, index) => {
      console.log(`${index + 1}. ${url}`);
    });

    await page.screenshot({ path: 'profile_scrolled.png' });

    // await browser.close();
  } catch (error) {
    console.error('오류 발생:', error.message);
    await page.screenshot({ path: 'error.png' });
  }
})();
