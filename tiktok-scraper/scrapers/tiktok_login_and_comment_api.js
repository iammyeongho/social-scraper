const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const TikTokCommentApiScraper = require('./tiktok_comment_scraper_api');
const path = require('path');

puppeteer.use(StealthPlugin());

// 실제 크롬 경로(본인 PC에 맞게 수정)
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'; // 또는 C:/Program Files (x86)/Google/Chrome/Application/chrome.exe
// 완전히 새로운 프로필 폴더(기존 폴더 재사용 X)
const USER_DATA_DIR = path.resolve(__dirname, '../../debug/chrome-profile-real');
const TIKTOK_USERNAME = 'keyisib865'; 

// [사용자 입력] 댓글을 수집할 영상 링크 배열을 직접 입력하세요
const VIDEO_LINKS = [
    // 예시: 'https://www.tiktok.com/@user1/video/7519782744184999198',
    'https://www.tiktok.com/@at_chaeunwoo/video/6632849022182755586'
];

async function openTikTokAndLogin() {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: CHROME_PATH,
        userDataDir: USER_DATA_DIR,
        args: [
            '--lang=ko-KR,ko',
            '--window-size=1200,900'
        ]
    });
    const page = await browser.newPage();
    await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded' });
    console.log('TikTok에 접속했습니다. 로그인 후 창을 닫으세요.');
    // 로그인 후 브라우저를 수동으로 닫으면 프로필이 저장됨
}

// 2. 저장된 프로필로 TikTok 주요 쿠키 추출
async function getTikTokSessionParams() {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: CHROME_PATH,
        userDataDir: USER_DATA_DIR,
        args: ['--lang=ko-KR,ko']
    });
    const page = await browser.newPage();
    await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded' });
    const cookies = await page.cookies();
    // msToken: 쿠키에서 추출
    const msToken = cookies.find(c => c.name === 'msToken')?.value || '';
    // verifyFp: 쿠키 또는 document.cookie에서 추출
    let verifyFp = cookies.find(c => c.name === 'verifyFp')?.value || '';
    if (!verifyFp) {
        verifyFp = await page.evaluate(() => {
            const match = document.cookie.match(/verifyFp=([^;]+)/);
            return match ? match[1] : '';
        });
    }
    // device_id: localStorage 또는 쿠키에서 추출
    let device_id = await page.evaluate(() => {
        return localStorage.getItem('tt_webid') || '';
    });
    if (!device_id) {
        device_id = cookies.find(c => c.name === 'tt_webid')?.value || '';
    }
    // 전체 쿠키 스트링
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    await browser.close();
    // 디버그 출력
    console.log('[디버그] msToken:', msToken);
    console.log('[디버그] verifyFp:', verifyFp);
    console.log('[디버그] device_id:', device_id);
    if (!msToken) console.warn('[경고] msToken 값이 비어있음');
    if (!verifyFp) console.warn('[경고] verifyFp 값이 비어있음');
    if (!device_id) console.warn('[경고] device_id 값이 비어있음');
    return { msToken, verifyFp, device_id, cookieString };
}

// 3. 게시물 리스트에서 a태그(영상 링크) 수집
async function collectVideoLinksFromFeed(username, max = 10) {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: CHROME_PATH,
        userDataDir: USER_DATA_DIR,
        args: ['--lang=ko-KR,ko']
    });
    const page = await browser.newPage();
    await page.goto(`https://www.tiktok.com/@${username}`, { waitUntil: 'domcontentloaded' });
    // 스크롤을 내려서 더 많은 게시물 로딩(필요시)
    await autoScroll(page, 3);
    const videoLinks = await page.$$eval('a[href*="/video/"]', as => Array.from(new Set(as.map(a => a.href))));
    await browser.close();
    return videoLinks.slice(0, max);
}

// 스크롤 유틸
async function autoScroll(page, times = 10000) {
    for (let i = 0; i < times; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await new Promise(res => setTimeout(res, 1500));
    }
}

// Puppeteer로 영상 상세 페이지에서 댓글 API 네트워크 요청을 가로채 동적 파라미터 추출
async function getDynamicParamsFromNetwork(videoUrl) {
    const browser = await puppeteer.launch({
        headless: false, // 네트워크 요청 가로채기 위해 창 표시
        executablePath: CHROME_PATH,
        userDataDir: USER_DATA_DIR,
        args: ['--lang=ko-KR,ko']
    });
    const page = await browser.newPage();
    let foundParams = null;
    page.on('request', req => {
        const url = req.url();
        if (url.includes('/api/comment/list')) {
            const u = new URL(url);
            const params = Object.fromEntries(u.searchParams.entries());
            foundParams = {
                verifyFp: params.verifyFp,
                device_id: params.device_id,
                msToken: params.msToken
            };
        }
    });
    await page.goto(videoUrl, { waitUntil: 'networkidle2' });
    // 영상 페이지에서 댓글창이 보일 때까지 대기
    await new Promise(res => setTimeout(res, 5000));
    await browser.close();
    if (!foundParams) {
        throw new Error('댓글 API 네트워크 요청에서 파라미터를 추출하지 못했습니다. 영상 페이지에서 댓글이 보이도록 충분히 대기했는지 확인하세요.');
    }
    return foundParams;
}

// 영상 링크 배열로 댓글 수집
async function fetchCommentsForVideoLinks(videoLinks, maxComments = 100000) {
    for (const link of videoLinks) {
        console.log(`[단계1] 영상 상세 페이지에서 동적 파라미터 추출 시도: ${link}`);
        let params;
        try {
            params = await getDynamicParamsFromNetwork(link);
        } catch (e) {
            console.error('[에러] 동적 파라미터 추출 실패:', e.message);
            continue;
        }
        const aweme_id = link.split('/video/')[1].split('?')[0];
        console.log(`[진행] 영상 aweme_id=${aweme_id} 댓글 수집 중...`);
        const scraper = new TikTokCommentApiScraper({ msToken: params.msToken });
        const comments = await scraper.fetchAllComments(aweme_id, maxComments, {
            extraParams: {
                verifyFp: params.verifyFp,
                device_id: params.device_id,
            }
        });
        console.log(`\n[${aweme_id}] 댓글 ${comments.length}개 수집 완료`);
        comments.forEach((c, i) => {
            console.log(`[${i+1}] ${c.user?.nickname || c.user?.unique_id || 'unknown'}: ${c.text}`);
        });
    }
}

// 기존 자동 피드 수집 함수는 주석 처리
// async function fetchCommentsForAllVideos(username, maxVideos = 5, maxComments = 100000) { ... }

// 실행 예시 (명령행 인자에 따라 동작 분기)
if (require.main === module) {
    const mode = process.argv[2];
    (async () => {
        try {
            if (mode === 'login') {
                console.log('[안내] TikTok 로그인 창을 엽니다. 로그인 후 창을 닫으세요.');
                await openTikTokAndLogin();
                console.log('[안내] 로그인 세션이 저장되었습니다. 이제 다시 실행해서 댓글을 수집하세요.');
                return;
            }
            // 기본: 댓글 수집
            console.log('[시작] TikTok 댓글 자동 수집 (직접 입력한 영상 링크 기준)');
            if (VIDEO_LINKS.length === 0) {
                console.log('[안내] VIDEO_LINKS 배열에 영상 링크를 1개 이상 입력하세요.');
                return;
            }
            await fetchCommentsForVideoLinks(VIDEO_LINKS, 100000);
            console.log('[완료] 전체 작업이 정상적으로 끝났습니다.');
        } catch (e) {
            console.error('[최상위 에러]', e);
        }
    })();
    if (!mode) {
        console.log('\n[사용법]');
        console.log('  node tiktok_login_and_comment_api.js login   # TikTok 로그인 창 열기');
        console.log('  node tiktok_login_and_comment_api.js         # 댓글 수집 실행');
    }
} 