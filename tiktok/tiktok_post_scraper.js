const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config').tiktok;

puppeteer.use(StealthPlugin());

/**
 * 틱톡 게시물 스크래퍼
 * 개별 비디오의 상세 정보를 수집
 */
class TikTokPostScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * 브라우저 초기화
   */
  async initialize() {
    try {
      console.log('틱톡 게시물 스크래퍼 초기화 중...');
      
      this.browser = await puppeteer.launch({
        headless: config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          `--window-size=${config.desktopViewport.width},${config.desktopViewport.height}`,
          '--lang=ko-KR,ko'
        ]
      });

      this.page = await this.browser.newPage();
      
      // 데스크톱 User-Agent 설정
      await this.page.setUserAgent(config.desktopUserAgent);
      
      // 데스크톱 뷰포트 설정
      await this.page.setViewport({
        width: config.desktopViewport.width,
        height: config.desktopViewport.height
      });

      console.log('✓ 틱톡 게시물 스크래퍼 초기화 완료 (데스크톱 뷰)');
      return true;

    } catch (error) {
      console.error('틱톡 게시물 스크래퍼 초기화 오류:', error.message);
      return false;
    }
  }

  /**
   * 틱톡 게시물 스크래핑
   * @param {string} postUrl - 게시물 URL
   * @returns {Promise<Object>} 게시물 데이터
   */
  async scrapePost(postUrl) {
    try {
      console.log(`틱톡 게시물 스크래핑 시작: ${postUrl}`);
      
      await this.page.goto(postUrl, { 
        waitUntil: 'networkidle2',
        timeout: config.timeout 
      });

      // 페이지 로딩 대기
      await this.delay(config.pageLoadDelay);

      // 디버깅: 페이지 요소 확인
      await this.debugPageElements();

      // 게시물 정보 수집
      const postData = await this.extractPostInfo(postUrl);
      
      console.log(`✓ 게시물 스크래핑 완료: ${postUrl}`);
      console.log(`  - 작성자: @${postData.username}`);
      console.log(`  - 좋아요: ${postData.like_count}`);
      console.log(`  - 댓글: ${postData.comment_count}`);
      console.log(`  - 공유: ${postData.share_count}`);
      console.log(`  - 조회수: ${postData.view_count}`);

      return postData;

    } catch (error) {
      console.error(`틱톡 게시물 스크래핑 오류 (${postUrl}):`, error.message);
      
      // 오류 시 스크린샷 저장
      if (this.page) {
        const timestamp = Date.now();
        await this.page.screenshot({ 
          path: `error_tiktok_post_${timestamp}.png`,
          fullPage: true 
        });
      }
      
      return null;
    }
  }

  /**
   * 페이지 요소 디버깅
   */
  async debugPageElements() {
    try {
      console.log('=== 페이지 요소 디버깅 ===');
      
      const debugInfo = await this.page.evaluate(() => {
        function safeSelector(el) {
          let sel = el.tagName;
          if (el.id) sel += '#' + el.id;
          if (typeof el.className === 'string' && el.className.length > 0) sel += '.' + el.className.split(' ').join('.');
          return sel;
        }
        const pick = (selector) => Array.from(document.querySelectorAll(selector)).map(el => ({
          selector: safeSelector(el),
          text: el.textContent.trim(),
          dataE2e: el.getAttribute('data-e2e')
        }));
        return {
          like: pick('[data-e2e*="like"]'),
          comment: pick('[data-e2e*="comment"]'),
          share: pick('[data-e2e*="share"]'),
          bookmark: pick('[data-e2e*="undefined-count"]')
        };
      });
      console.log('좋아요:', debugInfo.like);
      console.log('댓글:', debugInfo.comment);
      console.log('공유:', debugInfo.share);
      console.log('북마크:', debugInfo.bookmark);
      await this.page.screenshot({ 
        path: `debug_post_page_${Date.now()}.png`,
        fullPage: true 
      });
    } catch (error) {
      console.error('디버깅 중 오류:', error.message);
    }
  }

  /**
   * 게시물 정보 추출
   * @param {string} postUrl - 게시물 URL
   * @returns {Promise<Object>} 게시물 정보
   */
  async extractPostInfo(postUrl) {
    try {
      const postData = await this.page.evaluate((selectors, url) => {
        // 모바일 선택자 우선 사용
        const mobileSelectors = selectors.post.mobile;
        
        // 작성자 정보
        const usernameElement = document.querySelector(mobileSelectors.username) || document.querySelector(selectors.post.username);
        const displayNameElement = document.querySelector(mobileSelectors.displayName) || document.querySelector(selectors.post.displayName);
        
        // 비디오 설명 (본문) - 새로운 구조
        const contentContainer = document.querySelector(selectors.post.content);
        const contentText = contentContainer ? contentContainer.innerText.trim() : '';
        const contentTextElements = document.querySelectorAll(selectors.post.contentText);
        
        // 해시태그와 멘션 (새로운 구조)
        const hashtagElements = document.querySelectorAll(selectors.post.hashtags);
        const mentionElements = document.querySelectorAll(selectors.post.mentions);
        
        // 상호작용 수 (모바일 선택자 우선)
        const likeElement = document.querySelector(mobileSelectors.likeCount) || document.querySelector(selectors.post.likeCount);
        const commentElement = document.querySelector(mobileSelectors.commentCount) || document.querySelector(selectors.post.commentCount);
        const shareElement = document.querySelector(mobileSelectors.shareCount) || document.querySelector(selectors.post.shareCount);
        const bookmarkElement = document.querySelector(mobileSelectors.bookmarkCount) || document.querySelector(selectors.post.bookmarkCount);
        const viewElement = document.querySelector(mobileSelectors.viewCount) || document.querySelector(selectors.post.viewCount);
        
        // 업로드 날짜
        const uploadDateElement = document.querySelector(mobileSelectors.uploadDate) || document.querySelector(selectors.post.uploadDate);
        
        // 비디오 길이
        const durationElement = document.querySelector(selectors.post.videoDuration);
        
        // 썸네일
        const thumbnailElement = document.querySelector(selectors.post.thumbnail);
        
        // 음악 정보
        const musicTitleElement = document.querySelector(mobileSelectors.musicTitle) || document.querySelector(selectors.post.musicTitle);
        const musicArtistElement = document.querySelector(mobileSelectors.musicArtist) || document.querySelector(selectors.post.musicArtist);
        
        // 인증 배지
        const verifiedBadgeElement = document.querySelector(selectors.post.verifiedBadge);
        const privateBadgeElement = document.querySelector(selectors.post.privateBadge);
        
        // 위치 정보
        const locationElement = document.querySelector(selectors.post.location);
        
        // 숫자 정규화 함수
        const normalizeNumber = (text) => {
          if (!text) return 0;
          const num = text.replace(/[^0-9.]/g, '');
          if (text.includes('K')) return parseFloat(num) * 1000;
          if (text.includes('M')) return parseFloat(num) * 1000000;
          if (text.includes('B')) return parseFloat(num) * 1000000000;
          return parseInt(num) || 0;
        };
        
        // 날짜 계산 함수
        const calculateDate = (dateText) => {
          if (!dateText) return new Date().toISOString();
          
          const now = new Date();
          const currentYear = now.getFullYear();
          
          // "6-9" 형태 (월-일)
          if (/^\d{1,2}-\d{1,2}$/.test(dateText)) {
            const [month, day] = dateText.split('-').map(Number);
            const date = new Date(currentYear, month - 1, day);
            
            // 만약 계산된 날짜가 현재보다 미래라면 작년으로 설정
            if (date > now) {
              date.setFullYear(currentYear - 1);
            }
            
            return date.toISOString();
          }
          
          // "4d ago", "2w ago", "1m ago" 형태
          const agoMatch = dateText.match(/^(\d+)([dwmy]) ago$/i);
          if (agoMatch) {
            const amount = parseInt(agoMatch[1]);
            const unit = agoMatch[2].toLowerCase();
            
            const date = new Date(now);
            
            switch (unit) {
              case 'd': // 일
                date.setDate(date.getDate() - amount);
                break;
              case 'w': // 주
                date.setDate(date.getDate() - (amount * 7));
                break;
              case 'm': // 월
                date.setMonth(date.getMonth() - amount);
                break;
              case 'y': // 년
                date.setFullYear(date.getFullYear() - amount);
                break;
            }
            
            return date.toISOString();
          }
          
          // 기타 형태는 현재 날짜 반환
          return now.toISOString();
        };
        
        // 해시태그 추출 (새로운 구조)
        const hashtags = Array.from(hashtagElements).map(el => {
          const strongElement = el.querySelector('strong');
          const text = strongElement ? strongElement.textContent.trim() : el.textContent.trim();
          const href = el.getAttribute('href');
          return {
            text: text,
            url: href ? `https://www.tiktok.com${href}` : ''
          };
        });
        
        // 멘션 추출 (새로운 구조)
        const mentions = Array.from(mentionElements).map(el => {
          const strongElement = el.querySelector('strong');
          const text = strongElement ? strongElement.textContent.trim() : el.textContent.trim();
          const href = el.getAttribute('href');
          return {
            text: text,
            url: href ? `https://www.tiktok.com${href}` : ''
          };
        });
        
        // 비디오 URL 추출 (video 태그에서)
        const videoElement = document.querySelector(selectors.post.videoElement);
        const videoUrl = videoElement ? videoElement.src : '';
        
        // 추가 정보 수집
        const hashtagTexts = hashtags.map(h => h.text);
        const mentionTexts = mentions.map(m => m.text);
        
        return {
          post_url: url,
          username: usernameElement ? usernameElement.textContent.trim() : '',
          display_name: displayNameElement ? displayNameElement.textContent.trim() : '',
          content: contentText,
          content_spans: Array.from(contentTextElements).map(el => el.textContent.trim()),
          hashtags: hashtagTexts,
          hashtags_detail: hashtags,
          mentions: mentionTexts,
          mentions_detail: mentions,
          like_count: normalizeNumber(likeElement ? likeElement.textContent : '0'),
          comment_count: normalizeNumber(commentElement ? commentElement.textContent : '0'),
          share_count: normalizeNumber(shareElement ? shareElement.textContent : '0'),
          bookmark_count: normalizeNumber(bookmarkElement ? bookmarkElement.textContent : '0'),
          view_count: normalizeNumber(viewElement ? viewElement.textContent : '0'),
          upload_date: calculateDate(uploadDateElement ? uploadDateElement.textContent.trim() : ''),
          video_duration: durationElement ? durationElement.textContent.trim() : '',
          video_url: videoUrl,
          thumbnail_url: thumbnailElement ? thumbnailElement.src : '',
          music_title: musicTitleElement ? musicTitleElement.textContent.trim() : '',
          music_artist: musicArtistElement ? musicArtistElement.textContent.trim() : '',
          is_verified: !!verifiedBadgeElement,
          is_private: !!privateBadgeElement,
          location: locationElement ? locationElement.textContent.trim() : '',
          scraped_at: new Date().toISOString()
        };
      }, config.selectors, postUrl);

      return postData;

    } catch (error) {
      console.error('게시물 정보 추출 오류:', error.message);
      return {
        post_url: postUrl,
        username: '',
        display_name: '',
        content: '',
        content_spans: [],
        hashtags: [],
        hashtags_detail: [],
        mentions: [],
        mentions_detail: [],
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        bookmark_count: 0,
        view_count: 0,
        upload_date: new Date().toISOString(),
        video_duration: '',
        video_url: '',
        thumbnail_url: '',
        music_title: '',
        music_artist: '',
        is_verified: false,
        is_private: false,
        location: '',
        scraped_at: new Date().toISOString()
      };
    }
  }

  /**
   * 여러 게시물 스크래핑
   * @param {Array} postUrls - 게시물 URL 배열
   * @returns {Promise<Array>} 게시물 데이터 배열
   */
  async scrapeMultiplePosts(postUrls) {
    const results = [];
    
    for (const postUrl of postUrls) {
      try {
        const postData = await this.scrapePost(postUrl);
        if (postData) {
          results.push(postData);
        }
        
        // 요청 간 딜레이
        await this.delay(config.requestDelay);
        
      } catch (error) {
        console.error(`게시물 스크래핑 오류 (${postUrl}):`, error.message);
      }
    }
    
    return results;
  }

  /**
   * 브라우저 종료
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log('✓ 틱톡 게시물 스크래퍼 종료');
      }
    } catch (error) {
      console.error('브라우저 종료 오류:', error.message);
    }
  }

  /**
   * 딜레이 함수
   * @param {number} ms - 밀리초
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TikTokPostScraper;

 