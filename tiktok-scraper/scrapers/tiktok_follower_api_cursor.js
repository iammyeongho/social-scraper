const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const path = require('path');
const zlib = require('zlib');
const fs = require('fs');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}
const allXhrLogPath = path.join(logsDir, 'all_xhr_responses.txt');
const responseErrorLogPath = path.join(logsDir, 'response_error.txt');
const emptyUserlistLogPath = path.join(logsDir, 'empty_userlist_response.txt');
const LOG_PATH = path.join(logsDir, 'follower_api_requests.jsonl');

puppeteer.use(StealthPlugin());

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER_DATA_DIR = path.resolve(__dirname, '../../debug/chrome-profile-real');

// [사용자 입력] 팔로워를 수집할 TikTok 프로필 URL
const PROFILE_URL = 'https://www.tiktok.com/@wwncom';

// 터미널에서 복사한 쿼리 파라미터(최초 요청 기준)
const BASE_PARAMS = {
  WebIdLastTime: '1751852860',
  aid: '1988',
  app_language: 'en',
  app_name: 'tiktok_web',
  browser_language: 'en-US',
  browser_name: 'Mozilla',
  browser_online: 'true',
  browser_platform: 'Win32',
  browser_version: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  channel: 'tiktok_web',
  cookie_enabled: 'true',
  count: '30',
  data_collection_enabled: 'true',
  device_id: '7524150717650732552',
  device_platform: 'web_pc',
  focus_state: 'true',
  from_page: 'user',
  history_len: '2',
  is_fullscreen: 'false',
  is_page_visible: 'true',
  maxCursor: '0', // 반복 호출 시 변경
  minCursor: '1740404689', // 반복 호출 시 변경
  odinId: '7517494135998448648',
  os: 'windows',
  priority_region: 'KR',
  referer: '',
  region: 'KR',
  scene: '67',
  screen_height: '2160',
  screen_width: '3840',
  secUid: 'MS4wLjABAAAA_dHS5bK182iUI6nsi2kQuEeMp1GqFs89CpmqyFM0Qu29Cm4w5OmC4_cUWpcArm31',
  tz_name: 'Asia/Seoul',
  user_is_login: 'true',
  webcast_language: 'en',
  msToken: '0t-Qc957CXLPoFGSRuUPecrWdfZjlr2aUnyGfW7VSLbcSf2nkkRoS4fiYgrP0ni3ks1uI7U2ePLuGdmjP6pr6LWCHm3QN5DLCk_0hwZL4gn9VQCvj7b76yN_t445RtVM-JvlbY4c1Nw5Hhk=',
  'X-Bogus': 'DFSzswVuIehANC5WCtCPlwOorqVX',
  'X-Gnarly': 'MOeQjYkRaUWhtk-zqKRplxhmc2uz7UprlJGC-JvMlAuv3tIuUg0z72xepj/QmWVZ/SVwFeYmTnv-ga7ml6UqeiicQJyVwcyhQjcAeul0upQl/5hpLX2HxJx/xProKWIM6Aui6nn5DkoE/ZYBZABbRORzLSPD8xRLfbDEiRdHY59hzdGO2c23CU-TJwQ3IVl9s-uCVh2CF-hqvD/OtUY88LpXfzSrwdomdi97mzyVfy346SxA2aPqPXoyKRnw-KOLaUAXDSWqug0SYH9R/ntuSMqZsd6mQbRMym1dAqllqaA2'
};

// 터미널에서 복사한 헤더
const BASE_HEADERS = {
  'sec-ch-ua-platform': '"Windows"',
  referer: 'https://www.tiktok.com/@wwncom',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", ";Not A Brand";v="99"',
  'sec-ch-ua-mobile': '?0'
};

const API_BASE = 'https://www.tiktok.com/api/user/list/';

// 팔로워 팝업을 띄우고, 자동 스크롤 + 네트워크 요청 기록
async function getFollowerApiRequestInfoWithScroll(profileUrl, scrollCount = 20, scrollDelay = 2000) {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: CHROME_PATH,
        userDataDir: USER_DATA_DIR,
        args: ['--lang=ko-KR,ko']
    });
    const page = await browser.newPage();
    let found = null;
    // 네트워크 요청 가로채기 및 로그 기록
    page.on('request', req => {
        const url = req.url();
        if (url.includes('/api/user/list/')) {
            const u = new URL(url);
            const params = Object.fromEntries(u.searchParams.entries());
            const headers = req.headers();
            found = {
                apiUrl: url,
                params,
                headers,
                method: req.method(),
            };
            console.log('[가로챈 팔로워 API 요청]', url);
            console.log('[가로챈 쿼리 파라미터]', params);
            console.log('[가로챈 헤더]', headers);
            try {
                fs.appendFileSync(LOG_PATH, JSON.stringify({
                    type: 'request',
                    url,
                    params,
                    headers,
                    time: new Date().toISOString()
                }) + '\n');
            } catch (err) {
                console.error('[파일 기록 오류 - request]', err);
                if (!fs.existsSync(path.dirname(LOG_PATH))) {
                    console.error('[경고] 로그 디렉토리가 존재하지 않습니다:', path.dirname(LOG_PATH));
                } else {
                    console.error('[경고] 로그 파일 권한/경로 문제일 수 있습니다:', LOG_PATH);
                }
            }
        }
    });
    page.on('response', async res => {
        const url = res.url();
        if (url.includes('/api/user/list/')) {
            const headers = res.headers();
            let buffer;
            try {
                buffer = await res.buffer();
            } catch (e) {
                buffer = Buffer.from('');
            }
            try {
                fs.appendFileSync(LOG_PATH, JSON.stringify({
                    type: 'response',
                    url,
                    headers,
                    encoding: headers['content-encoding'],
                    raw: buffer.toString('base64'),
                    time: new Date().toISOString()
                }) + '\n');
            } catch (err) {
                console.error('[파일 기록 오류 - response]', err);
                if (!fs.existsSync(path.dirname(LOG_PATH))) {
                    console.error('[경고] 로그 디렉토리가 존재하지 않습니다:', path.dirname(LOG_PATH));
                } else {
                    console.error('[경고] 로그 파일 권한/경로 문제일 수 있습니다:', LOG_PATH);
                }
            }
        }
        if (res.request().resourceType() === 'xhr' || res.request().resourceType() === 'fetch') {
            const headers = res.headers();
            let buffer;
            try {
                buffer = await res.buffer();
            } catch (e) {
                buffer = Buffer.from('');
            }
            try {
                fs.appendFileSync(allXhrLogPath, JSON.stringify({
                    url,
                    headers,
                    raw: buffer.toString('base64'),
                    time: new Date().toISOString()
                }) + '\n');
            } catch (err) {
                console.error('[all_xhr_responses.txt 기록 실패]', err);
            }
        }
    });
    // 프로필 페이지 이동
    await page.goto(profileUrl, { waitUntil: 'networkidle2' });
    // 팔로워 버튼 클릭 (팝업 띄우기)
    await page.waitForSelector('[data-e2e="followers-count"]', {timeout: 15000});
    await page.click('[data-e2e="followers-count"]');
    // 팔로워 모달 컨테이너 대기
    await page.waitForSelector('section[role="dialog"]', {timeout: 15000});
    // 자동 스크롤 반복
    for (let i = 0; i < scrollCount; i++) {
        const scrolled = await page.evaluate(() => {
            // 실제 컨테이너 선택자(필요시 수정)
            const container = document.querySelector('section[role="dialog"] .css-wq5jjc-DivUserListContainer, section[role="dialog"] [class*="UserListContainer"]');
            if (container) {
                container.scrollTop += 1000;
                return container.scrollTop;
            }
            return null;
        });
        console.log(`[스크롤] ${i+1}/${scrollCount}회, scrollTop:`, scrolled);
        await new Promise(res => setTimeout(res, scrollDelay));
    }
    // 스크롤 후 3초 대기
    await new Promise(res => setTimeout(res, 3000));
    await browser.close();
    if (!found) {
        throw new Error('팔로워 API 네트워크 요청을 가로채지 못했습니다. 팝업이 정상적으로 떴는지, 팔로워가 존재하는 계정인지 확인하세요.');
    }
    return found;
}

// 팔로워 API 반복 호출로 모든 팔로워 수집
async function fetchAllFollowersByApi(max = 100000) {
    console.log(`[1단계] 팔로워 팝업에서 팔로워 API 파라미터/헤더 추출...`);
    const reqInfo = await getFollowerApiRequestInfoWithScroll(PROFILE_URL, 20, 2000);
    let { apiUrl, params, headers } = reqInfo;
    let hasMore = true;
    let allFollowers = [];
    let pageNum = 1;
    while (hasMore && allFollowers.length < max) {
        // 쿼리스트링 생성
        const queryString = Object.entries(params)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        const url = `${apiUrl}?${queryString}`;
        try {
            console.log(`[${pageNum}페이지] API 요청:`, url);
            const res = await axios.get(url, { headers, responseType: 'arraybuffer' });
            const encoding = res.headers['content-encoding'];
            let raw = res.data;
            let decoded = raw;
            if (encoding === 'br') {
                decoded = zlib.brotliDecompressSync(Buffer.from(raw)).toString();
            } else if (encoding === 'gzip') {
                decoded = zlib.gunzipSync(Buffer.from(raw)).toString();
            } else if (encoding === 'deflate') {
                decoded = zlib.inflateSync(Buffer.from(raw)).toString();
            } else {
                decoded = Buffer.from(raw).toString();
            }
            let parsed;
            try {
                parsed = JSON.parse(decoded);
            } catch (e) {
                console.error(`[${pageNum}페이지] 디코딩 후에도 JSON 파싱 실패:`, decoded.slice(0, 300));
                // 파싱 실패한 응답을 별도 파일에 기록
                try {
                    fs.appendFileSync(responseErrorLogPath, decoded.slice(0, 2000) + '\n---\n');
                } catch (err) {
                    console.error('[response_error.txt 기록 실패]', err);
                }
                break;
            }
            let followers = [];
            if (parsed.userList && Array.isArray(parsed.userList)) {
                followers = parsed.userList;
            }
            if (followers.length > 0) {
                allFollowers.push(...followers);
                // 응답에서 파라미터 갱신
                params.minCursor = parsed.minCursor || params.minCursor;
                params.msToken = parsed.msToken || params.msToken;
                params['X-Bogus'] = parsed['X-Bogus'] || params['X-Bogus'];
                params['X-Gnarly'] = parsed['X-Gnarly'] || params['X-Gnarly'];
                hasMore = parsed.hasMore || parsed.has_more;
                console.log(`[${pageNum}페이지] 팔로워 ${followers.length}명, 누적: ${allFollowers.length}명, hasMore: ${hasMore}, nextMinCursor: ${params.minCursor}`);
            } else {
                // userList가 없거나 빈 배열일 때 원본 응답 일부를 별도 파일에 기록
                try {
                    fs.appendFileSync(emptyUserlistLogPath, decoded.slice(0, 2000) + '\n---\n');
                } catch (err) {
                    console.error('[empty_userlist_response.txt 기록 실패]', err);
                }
                hasMore = false;
                console.warn(`[${pageNum}페이지] userList가 없거나 빈 배열입니다. 응답:`, JSON.stringify(parsed).slice(0, 300));
            }
        } catch (e) {
            console.error('API 요청 오류:', e.message);
            break;
        }
        // 간단한 봇 탐지 우회: 1~3초 랜덤 딜레이
        const sleepMs = 1000 + Math.floor(Math.random() * 2000);
        await new Promise(res => setTimeout(res, sleepMs));
        pageNum++;
    }
    return allFollowers.slice(0, max);
}

// 로그 파일에서 팔로워 userList를 추출해 id, 닉네임을 터미널에 출력
function printFollowersFromLog(logPath) {
    const fs = require('fs');
    if (!fs.existsSync(logPath)) {
        console.error('로그 파일이 존재하지 않습니다:', logPath);
        return;
    }
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
    let total = 0;
    lines.forEach(line => {
        try {
            const entry = JSON.parse(line);
            if (entry.type === 'response' && entry.raw) {
                const encoding = entry.encoding;
                const buffer = Buffer.from(entry.raw, 'base64');
                let decoded = buffer;
                if (encoding === 'br') {
                    decoded = require('zlib').brotliDecompressSync(buffer).toString();
                } else if (encoding === 'gzip') {
                    decoded = require('zlib').gunzipSync(buffer).toString();
                } else if (encoding === 'deflate') {
                    decoded = require('zlib').inflateSync(buffer).toString();
                } else {
                    decoded = buffer.toString();
                }
                let parsed;
                try {
                    parsed = JSON.parse(decoded);
                } catch (e) {
                    console.log('디코딩 결과(파싱 실패):', decoded.slice(0, 500));
                    return;
                }
                if (parsed.userList && Array.isArray(parsed.userList)) {
                    parsed.userList.forEach((f, i) => {
                        if (f.user) {
                            console.log(`[${++total}] id: ${f.user.uniqueId || f.user.id || 'unknown'}, nickname: ${f.user.nickname || 'unknown'}`);
                        }
                    });
                }
            }
        } catch (e) {}
    });
    console.log(`\n총 ${total}명의 팔로워 id/닉네임을 출력했습니다.`);
}

// 실행 예시: 자동 스크롤 + 네트워크 요청 기록 + 로그에서 id/닉네임 출력
(async () => {
    try {
        await getFollowerApiRequestInfoWithScroll(PROFILE_URL, 20, 2000);
        console.log('\n팔로워 모달 자동 스크롤 및 API 요청/응답 로그 기록이 완료되었습니다.');
        // 로그에서 id/닉네임 출력
        printFollowersFromLog(LOG_PATH);
    } catch (e) {
        console.error('[최상위 에러]', e);
    }
})(); 