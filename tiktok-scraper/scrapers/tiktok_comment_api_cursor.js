const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const path = require('path');

puppeteer.use(StealthPlugin());

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER_DATA_DIR = path.resolve(__dirname, '../../debug/chrome-profile-real');

// [사용자 입력] 댓글을 수집할 영상 링크
const VIDEO_URL = 'https://www.tiktok.com/@royal44lxvi/video/7521285844376866056';

// Puppeteer로 영상 상세 페이지에서 댓글 API 네트워크 요청을 가로채 동적 파라미터 추출
async function getInitialCommentApiParams(videoUrl) {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: CHROME_PATH,
        userDataDir: USER_DATA_DIR,
        args: ['--lang=ko-KR,ko']
    });
    const page = await browser.newPage();
    let foundParams = null;
    let foundHeaders = null;
    page.on('request', req => {
        const url = req.url();
        if (url.includes('/api/comment/list')) {
            const u = new URL(url);
            const params = Object.fromEntries(u.searchParams.entries());
            foundParams = params;
            foundHeaders = req.headers();
        }
    });
    await page.goto(videoUrl, { waitUntil: 'networkidle2' });
    // 영상 페이지에서 댓글창이 보일 때까지 대기
    await new Promise(res => setTimeout(res, 5000));
    await browser.close();
    if (!foundParams) {
        throw new Error('댓글 API 네트워크 요청에서 파라미터를 추출하지 못했습니다. 영상 페이지에서 댓글이 보이도록 충분히 대기했는지 확인하세요.');
    }
    return { params: foundParams, headers: foundHeaders };
}

// TikTok 댓글 API 반복 호출로 모든 댓글 수집
async function fetchAllCommentsByApi(videoUrl, max = 100000) {
    console.log(`[단계1] 영상 상세 페이지에서 댓글 API 파라미터 추출 시도...`);
    const { params: baseParams, headers: baseHeaders } = await getInitialCommentApiParams(videoUrl);
    const aweme_id = videoUrl.split('/video/')[1].split('?')[0];
    let cursor = baseParams.cursor || '0';
    let hasMore = true;
    let allComments = [];
    let page = 1;
    while (hasMore && allComments.length < max) {
        // 쿼리 파라미터 준비
        const queryParams = { ...baseParams, cursor };
        // X-Bogus, X-Gnarly 등은 최초 요청에서 추출한 값 사용
        const queryString = Object.entries(queryParams)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        const urlPath = '/api/comment/list/';
        const apiUrl = `https://www.tiktok.com${urlPath}?${queryString}`;
        // 헤더 준비 (쿠키, UA 등)
        const headers = {
            ...baseHeaders,
            'user-agent': baseHeaders['user-agent'] || baseHeaders['User-Agent'] || 'Mozilla/5.0',
            'cookie': baseHeaders['cookie'] || '',
        };
        try {
            const res = await axios.get(apiUrl, { headers });
            const data = res.data;
            if (data.comments && data.comments.length > 0) {
                allComments.push(...data.comments);
                cursor = data.cursor || (parseInt(cursor) + data.comments.length).toString();
                hasMore = data.has_more;
                console.log(`[${page}페이지] 누적 댓글: ${allComments.length}개`);
            } else {
                hasMore = false;
            }
        } catch (e) {
            console.error('API 요청 오류:', e.message);
            break;
        }
        // === 간단한 봇 탐지 우회: 1~3초 랜덤 딜레이 ===
        const sleepMs = 1000 + Math.floor(Math.random() * 2000);
        console.log(`[딜레이] ${sleepMs}ms 대기`);
        await new Promise(res => setTimeout(res, sleepMs));
        // =========================================
        page++;
    }
    return allComments.slice(0, max);
}

// 실행 예시
(async () => {
    try {
        const comments = await fetchAllCommentsByApi(VIDEO_URL, 100000);
        console.log(`\n총 수집 댓글: ${comments.length}개`);
        comments.forEach((c, i) => {
            console.log(`[${i+1}] ${c.user?.nickname || c.user?.unique_id || 'unknown'}: ${c.text}`);
        });
    } catch (e) {
        console.error('[최상위 에러]', e);
    }
})(); 