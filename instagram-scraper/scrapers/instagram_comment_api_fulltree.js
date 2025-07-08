const axios = require('axios');
const qs = require('qs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const config = require('../config/instagram');
puppeteer.use(StealthPlugin());

// =====================[ 사용자 입력: 아래 값만 수정 ]====================
const USER_DATA_DIR = config.chromeProfilePath;
const POST_URL = 'https://www.instagram.com/p/DLFh2Zgzmlo/comments/'; // 긁고 싶은 게시물의 /comments/ URL만 입력
// 네트워크 탭에서 복사한 쿠키 문자열
const COOKIE = 'datr=3KYhaGRVAvUKXfAYup8M9fM-; ig_did=BB30D391-DC11-403F-8427-BF8874C35D06; mid=aCGm3AALAAFtKJ8MFhGq90en-K9k; ig_nrcb=1; ps_l=1; ps_n=1; ig_lang=ko; csrftoken=D2gfsD411bcivMKBHvT00CQGLyHmZfcb; ds_user_id=75894083378; sessionid=75894083378%3ACBVyldpaRNJdiV%3A26%3AAYc4Sg1to8UojGuIcgRTnT1VLLvyaebVIxRnRgxkWw; wd=1258x944; rur="CCO\x2c75894083378\x2c1783409955:01feaaea1ee57d1bf994dc39b7cdb136e77b8f3831aefadeb4ef29a1d9080436b6a275f1"';
// 네트워크 탭에서 복사한 헤더 (필요한 값만)
const BASE_HEADERS = {
    'accept': '*/*',
    'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'cookie': COOKIE,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'x-asbd-id': '359341',
    'x-csrftoken': 'D2gfsD411bcivMKBHvT00CQGLyHmZfcb',
    'x-ig-app-id': '1217981644879628', // doc_id에 따라 다를 수 있음
    'x-ig-www-claim': 'hmac.AR3FZ9LW-OEeih2mzAdf_m7OK9X-_ZB3BVbpiWk6rtdiEpn6',
    'x-requested-with': 'XMLHttpRequest',
    'content-type': 'application/x-www-form-urlencoded',
    // 필요시 추가 헤더 입력
};
// ======================================================================

function commentKey(c) {
    return `${c.id || c.pk}_${c.text}`;
}

// GraphQL 기반 댓글 반복 수집
async function fetchAllCommentsGraphQL(doc_id, baseVariables, headers, max = 10000) {
    let allComments = [];
    let commentSet = new Set();
    let hasNextPage = true;
    let after = baseVariables.after;
    let page = 1;
    while (hasNextPage && allComments.length < max) {
        const variables = { ...baseVariables, after };
        const res = await axios.post(
            'https://www.instagram.com/graphql/query',
            qs.stringify({ doc_id, variables: JSON.stringify(variables) }),
            { headers }
        );
        const data = res.data;
        // 댓글 데이터 위치는 doc_id/쿼리에 따라 다를 수 있음 (아래는 PolarisPostCommentsPaginationQuery 기준)
        const edges = data?.data?.xdt_api__v1__media__media_id__comments__connection?.edges ||
                      data?.data?.shortcode_media?.edge_media_to_parent_comment?.edges || [];
        for (const edge of edges) {
            const c = edge.node || edge;
            if (!commentSet.has(commentKey(c))) {
                allComments.push(c);
                commentSet.add(commentKey(c));
            }
        }
        const pageInfo = data?.data?.xdt_api__v1__media__media_id__comments__connection?.page_info ||
                         data?.data?.shortcode_media?.edge_media_to_parent_comment?.page_info || {};
        hasNextPage = pageInfo.has_next_page;
        after = pageInfo.end_cursor;
        console.log(`[GraphQL ${page}페이지] 누적 댓글: ${allComments.length}개`);
        if (!hasNextPage || !after) break;
        await new Promise(res => setTimeout(res, 1000 + Math.floor(Math.random() * 1000)));
        page++;
    }
    return allComments.slice(0, max);
}

// Puppeteer로 doc_id, variables 추출 보조 함수 (네트워크 탭 자동화)
// page 인스턴스를 인자로 받도록 수정
async function extractGraphQLParamsWithPuppeteer(page) {
    let foundDocId = null;
    let foundVariables = null;
    page.on('request', req => {
        const url = req.url();
        if (url.includes('/graphql/query') && req.method() === 'POST') {
            const postData = req.postData();
            if (postData && postData.includes('PolarisPostCommentsPaginationQuery')) {
                const params = require('qs').parse(postData);
                foundDocId = params.doc_id;
                try {
                    foundVariables = JSON.parse(params.variables);
                } catch {}
                console.log('[Puppeteer] doc_id:', foundDocId);
                console.log('[Puppeteer] variables:', foundVariables);
            }
        }
    });
    // 네트워크 요청이 발생할 때까지 대기
    await page.waitForTimeout(8000);
    return { doc_id: foundDocId, variables: foundVariables };
}

(async () => {
    try {
        // Puppeteer로 로그인된 세션의 쿠키/토큰 추출 및 페이지 오픈
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: USER_DATA_DIR,
            args: ['--lang=ko-KR,ko'],
            executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' // 필요시 경로 수정
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 390, height: 844, isMobile: true });
        await page.goto(POST_URL, { waitUntil: 'networkidle2' });

        // 1. doc_id, variables 자동 추출 (page 인스턴스 재사용)
        const params = await extractGraphQLParamsWithPuppeteer(page);
        const DOC_ID = params.doc_id;
        const BASE_VARIABLES = params.variables;
        if (!DOC_ID || !BASE_VARIABLES) {
            throw new Error('doc_id 또는 variables 추출 실패! 네트워크 탭에서 GraphQL 요청이 발생하는지 확인하세요.');
        }

        // 2. 쿠키/헤더 추출
        const cookies = await page.cookies();
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const csrfCookie = cookies.find(c => c.name === 'csrftoken');
        const csrfToken = csrfCookie ? csrfCookie.value : '';
        const headers = { ...BASE_HEADERS };
        headers.cookie = cookieString;
        headers['x-csrftoken'] = csrfToken;

        // 3. 댓글 GraphQL API 반복 호출
        console.log('[GraphQL] 인스타그램 댓글 GraphQL API 반복 호출 시작...');
        const comments = await fetchAllCommentsGraphQL(DOC_ID, BASE_VARIABLES, headers, 10000);
        console.log(`\n총 수집 댓글: ${comments.length}개`);
        comments.forEach((c, i) => {
            const user = c.owner?.username || c.user?.username || c.user?.full_name || 'unknown';
            console.log(`[${i+1}] ${user}: ${c.text}`);
        });

        await browser.close();
    } catch (e) {
        console.error('[최상위 에러]', e);
    }
})(); 