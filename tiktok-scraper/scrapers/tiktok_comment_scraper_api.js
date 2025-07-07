const axios = require('axios');
const path = require('path');
const { sign: generateXBogus } = require(path.resolve(__dirname, '../../TiktokDouyinCrawler-main/utils/x_bogus.js'));

/**
 * TikTok 댓글 API 직접 호출 스크래퍼 (Node.js)
 * - msToken, X-Bogus는 실제 값 또는 생성 함수 필요 (이제 X-Bogus는 자동 생성)
 * - aweme_id(영상 ID)만 알면 댓글을 모두 수집 가능
 */
class TikTokCommentApiScraper {
    constructor(options = {}) {
        this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
        this.msToken = options.msToken || '';
        this.proxy = options.proxy || null; // { protocol, host, port, auth }
    }

    /**
     * TikTok 댓글 전체 수집
     * @param {string} aweme_id - 영상 ID
     * @param {number} [max=10000000] - 최대 댓글 수
     * @param {object} [options] - 추가 옵션
     * @returns {Promise<Array>} 댓글 배열
     */
    async fetchAllComments(aweme_id, max = 10000000, options = {}) {
        let cursor = 0;
        let hasMore = true;
        let allComments = [];
        let page = 1;

        // 네트워크 탭에서 복사한 실제 쿠키, 헤더, User-Agent 등 옵션에서 받기
        const {
            cookie = '',
            referer = '',
            x_mssdk_info = '',
            extraParams = {}, // 추가 파라미터 필요시
        } = options;

        // 네트워크 탭에서 복사한 쿼리 파라미터(aweme_id, cursor 등만 동적으로)
        const baseParams = {
            WebIdLastTime: '1746001218',
            aid: '1988',
            app_language: 'ja-JP',
            app_name: 'tiktok_web',
            browser_language: 'ko-KR',
            browser_name: 'Mozilla',
            browser_online: 'true',
            browser_platform: 'Win32',
            browser_version: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            channel: 'tiktok_web',
            comment_id: aweme_id, // 실제는 comment_id, item_id 등 필요에 따라
            cookie_enabled: 'true',
            count: '20',
            current_region: 'JP',
            data_collection_enabled: 'true',
            device_id: '7499018103893263880',
            device_platform: 'web_pc',
            enter_from: 'tiktok_web',
            focus_state: 'true',
            fromWeb: '1',
            from_page: 'video',
            history_len: '8',
            is_fullscreen: 'false',
            is_page_visible: 'true',
            item_id: aweme_id, // 실제는 item_id
            odinId: '7517494135998448648',
            os: 'windows',
            priority_region: 'KR',
            referer: referer || 'https://www.tiktok.com/',
            region: 'KR',
            root_referer: referer || 'https://www.tiktok.com/',
            screen_height: '2160',
            screen_width: '3840',
            tz_name: 'Asia/Seoul',
            user_is_login: 'true',
            verifyFp: 'verify_mcsfv1nq_gFblw9oD_0ktX_4Zvr_B5aV_62t3v10BI5jB',
            webcast_language: 'en',
            msToken: this.msToken,
            // cursor: 동적으로
            // X-Bogus: 나중에
            ...extraParams,
        };

        while (hasMore && allComments.length < max) {
            // cursor 동적 반영
            const params = { ...baseParams, cursor };
            // 쿼리스트링 생성 (X-Bogus 제외)
            const queryString = Object.entries(params)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&');
            const urlPath = '/api/comment/list/reply/';
            const fullUrlForXbogus = urlPath + '?' + queryString;

            // --- X-Bogus 생성 전 검증 및 디버깅 ---
            if (!fullUrlForXbogus || typeof fullUrlForXbogus !== 'string' || !fullUrlForXbogus.includes('?')) {
                console.error('[X-Bogus 생성 오류] URL이 올바르지 않습니다:', fullUrlForXbogus);
                throw new Error('X-Bogus 생성용 URL이 비어있거나 잘못되었습니다.');
            }
            if (!this.userAgent || typeof this.userAgent !== 'string') {
                console.error('[X-Bogus 생성 오류] User-Agent가 올바르지 않습니다:', this.userAgent);
                throw new Error('X-Bogus 생성용 User-Agent가 비어있거나 잘못되었습니다.');
            }
            console.log('[X-Bogus 생성] URL:', fullUrlForXbogus);
            console.log('[X-Bogus 생성] User-Agent:', this.userAgent);
            // --- 실제 X-Bogus 생성 ---
            let xbogus;
            try {
                xbogus = generateXBogus(fullUrlForXbogus, this.userAgent);
            } catch (xbogusErr) {
                console.error('[X-Bogus 생성 중 에러]', xbogusErr);
                throw new Error('X-Bogus 생성 함수에서 예외 발생: ' + xbogusErr.message);
            }
            const finalUrl = `https://www.tiktok.com${urlPath}?${queryString}&X-Bogus=${xbogus}`;

            const headers = {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'cookie': cookie,
                'referer': referer || 'https://www.tiktok.com/',
                'user-agent': this.userAgent,
            };
            if (x_mssdk_info) headers['x-mssdk-info'] = x_mssdk_info;

            const axiosOpts = { headers };
            if (this.proxy) axiosOpts.proxy = this.proxy;

            try {
                const res = await axios.get(finalUrl, axiosOpts);
                const data = res.data;
                if (data.comments && data.comments.length > 0) {
                    allComments.push(...data.comments);
                    cursor = data.cursor || (cursor + data.comments.length);
                    hasMore = data.has_more;
                    console.log(`[${page}페이지] 누적 댓글: ${allComments.length}개`);
                } else {
                    hasMore = false;
                }
            } catch (e) {
                console.error('API 요청 오류:', e.message);
                break;
            }
            page++;
        }
        return allComments.slice(0, max);
    }

    /**
     * TikTok 댓글 API URL 생성 (X-Bogus 포함 여부 선택)
     */
    _buildApiUrl(aweme_id, cursor = 0, withXbogus = false) {
        let url = `https://www.tiktok.com/api/comment/list/?aid=1988&aweme_id=${aweme_id}&cursor=${cursor}&count=20&msToken=${this.msToken}`;
        if (withXbogus) {
            const xbogus = generateXBogus(url, this.userAgent);
            url += `&X-Bogus=${xbogus}`;
        }
        return url;
    }
}

// 사용 예시 (직접 실행 시)
if (require.main === module) {
    const aweme_id = '6632849022182755586'; // 테스트용 영상 ID
    const msToken = ''; // 실제 값 필요
    const scraper = new TikTokCommentApiScraper({ msToken });
    scraper.fetchAllComments(aweme_id, 100)
        .then(comments => {
            console.log(`총 수집 댓글: ${comments.length}개`);
            comments.forEach((c, i) => {
                console.log(`[${i+1}] ${c.user?.nickname || c.user?.unique_id || 'unknown'}: ${c.text}`);
            });
        })
        .catch(err => {
            console.error('댓글 수집 실패:', err);
        });
}

module.exports = TikTokCommentApiScraper; 