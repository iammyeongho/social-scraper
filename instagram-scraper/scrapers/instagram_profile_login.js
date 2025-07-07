const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');

puppeteer.use(StealthPlugin());

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER_DATA_DIR = path.resolve(__dirname, '../chrome-profile');

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: CHROME_PATH,
        userDataDir: USER_DATA_DIR,
        args: ['--lang=ko-KR,ko']
    });
    const page = await browser.newPage();
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
    console.log('\n[안내] 새로 열린 크롬 창에서 인스타그램에 직접 로그인하세요.\n로그인 및 2차 인증까지 완료한 후, 창을 닫으면 프로필이 프로젝트 폴더에 저장됩니다.\n(이후 스크래핑은 이 프로필을 자동으로 사용합니다.)');
    // 사용자가 직접 창을 닫을 때까지 대기
    await browser.waitForTarget(() => false);
})(); 