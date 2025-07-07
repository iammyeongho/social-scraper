const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const path = require('path');

puppeteer.use(StealthPlugin());

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER_DATA_DIR = path.resolve(__dirname, '../../debug/chrome-profile-real');

// [사용자 입력] 댓글을 수집할 영상 링크
const VIDEO_URL = 'https://www.tiktok.com/@hyesister_/video/7523506275481652488';

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
    await new Promise(res => setTimeout(res, 5000));
    await browser.close();
    if (!foundParams) {
        throw new Error('댓글 API 네트워크 요청에서 파라미터를 추출하지 못했습니다. 영상 페이지에서 댓글이 보이도록 충분히 대기했는지 확인하세요.');
    }
    return { params: foundParams, headers: foundHeaders };
}

// TikTok 댓글 API 반복 호출로 모든 최상위 댓글 수집
async function fetchAllTopCommentsByApi(baseParams, baseHeaders, max = 100000) {
    let cursor = baseParams.cursor || '0';
    let hasMore = true;
    let allComments = [];
    let commentSet = new Set();
    let page = 1;
    let prevCursor = null;
    while (hasMore && allComments.length < max) {
        const queryParams = { ...baseParams, cursor, count: '50' };
        const queryString = Object.entries(queryParams)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        const urlPath = '/api/comment/list/';
        const apiUrl = `https://www.tiktok.com${urlPath}?${queryString}`;
        const headers = {
            ...baseHeaders,
            'user-agent': baseHeaders['user-agent'] || baseHeaders['User-Agent'] || 'Mozilla/5.0',
            'cookie': baseHeaders['cookie'] || '',
        };
        try {
            const res = await axios.get(apiUrl, { headers });
            const data = res.data;
            if (data.comments && data.comments.length > 0) {
                for (const comment of data.comments) {
                    if (!commentSet.has(comment.cid)) {
                        allComments.push(comment);
                        commentSet.add(comment.cid);
                    }
                }
                prevCursor = cursor;
                cursor = data.cursor || (parseInt(cursor) + data.comments.length).toString();
                hasMore = data.has_more && cursor !== prevCursor;
                console.log(`[Top ${page}페이지] 누적 댓글: ${allComments.length}개`);
            } else {
                hasMore = false;
            }
        } catch (e) {
            console.error('Top-level API 요청 오류:', e.message);
            break;
        }
        // 간단한 봇 탐지 우회: 1~3초 랜덤 딜레이
        const sleepMs = 1000 + Math.floor(Math.random() * 2000);
        await new Promise(res => setTimeout(res, sleepMs));
        page++;
    }
    return allComments.slice(0, max);
}

// TikTok 대댓글(Reply) API 반복 호출로 모든 대댓글 수집
async function fetchAllRepliesByApi(baseParams, baseHeaders, comment_id, item_id, max = 10000) {
    let cursor = '0';
    let hasMore = true;
    let allReplies = [];
    let replySet = new Set();
    let page = 1;
    let prevCursor = null;
    while (hasMore && allReplies.length < max) {
        const queryParams = {
            ...baseParams,
            comment_id,
            item_id,
            cursor,
            count: '50'
        };
        // /api/comment/list/reply/ 엔드포인트 사용
        const urlPath = '/api/comment/list/reply/';
        const queryString = Object.entries(queryParams)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        const apiUrl = `https://www.tiktok.com${urlPath}?${queryString}`;
        const headers = {
            ...baseHeaders,
            'user-agent': baseHeaders['user-agent'] || baseHeaders['User-Agent'] || 'Mozilla/5.0',
            'cookie': baseHeaders['cookie'] || '',
        };
        try {
            const res = await axios.get(apiUrl, { headers });
            const data = res.data;
            if (data.comments && data.comments.length > 0) {
                for (const reply of data.comments) {
                    if (!replySet.has(reply.cid)) {
                        allReplies.push(reply);
                        replySet.add(reply.cid);
                    }
                }
                prevCursor = cursor;
                cursor = data.cursor || (parseInt(cursor) + data.comments.length).toString();
                hasMore = data.has_more && cursor !== prevCursor;
                console.log(`[Reply ${page}페이지] 누적 대댓글: ${allReplies.length}개`);
            } else {
                hasMore = false;
            }
        } catch (e) {
            console.error('Reply API 요청 오류:', e.message);
            break;
        }
        // 간단한 봇 탐지 우회: 1~3초 랜덤 딜레이
        await new Promise(res => setTimeout(res));
        page++;
    }
    return allReplies.slice(0, max);
}

// 단일 정렬/페이지네이션 방식만 사용 (최신순)
const SORT_TYPE = 1; // 최신순
const PAGINATION_TYPE = undefined;

// 실행 예시
(async () => {
    try {
        console.log('[단계1] 영상 상세 페이지에서 댓글 API 파라미터 추출 시도...');
        const { params: baseParams, headers: baseHeaders } = await getInitialCommentApiParams(VIDEO_URL);
        const aweme_id = VIDEO_URL.split('/video/')[1].split('?')[0];
        let allComments = [];
        let commentSet = new Set();
        const commentKey = c => `${c.cid}_${c.text}`;
        // 단일 조합만 시도
        console.log(`\n[정렬/페이지네이션] sort_type=${SORT_TYPE}, pagination_type=${PAGINATION_TYPE}로 댓글 수집 시작`);
        const paramsWithCombo = { ...baseParams, sort_type: String(SORT_TYPE) };
        if (PAGINATION_TYPE !== undefined) paramsWithCombo.pagination_type = PAGINATION_TYPE;
        // 1. 최상위 댓글 전체 수집
        const topComments = await fetchAllTopCommentsByApi(paramsWithCombo, baseHeaders, 100000);
        // 2. 각 댓글의 대댓글(더보기)까지 모두 수집
        for (const c of topComments) {
            if (!commentSet.has(commentKey(c))) {
                allComments.push(c);
                commentSet.add(commentKey(c));
            }
            if (c.reply_comment_total && c.reply_comment_total > 0) {
                console.log(`[대댓글] ${c.reply_comment_total}개 대댓글 수집 시도: comment_id=${c.cid}`);
                const replies = await fetchAllRepliesByApi(paramsWithCombo, baseHeaders, c.cid, aweme_id, 10000);
                for (const reply of replies) {
                    if (!commentSet.has(commentKey(reply))) {
                        allComments.push(reply);
                        commentSet.add(commentKey(reply));
                    }
                }
            }
        }
        console.log(`\n총 수집 댓글(최상위+대댓글, 중복제거): ${allComments.length}개`);
        allComments.forEach((c, i) => {
            console.log(`[${i+1}] ${c.user?.nickname || c.user?.unique_id || 'unknown'}: ${c.text}`);
        });
    } catch (e) {
        console.error('[최상위 에러]', e);
    }
})(); 