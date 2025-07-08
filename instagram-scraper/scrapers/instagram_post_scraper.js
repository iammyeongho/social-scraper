const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { setTimeout: sleep } = require('node:timers/promises');
const config = require('../config/instagram');

puppeteer.use(StealthPlugin());

const postUrls = config.testUrls;

(async () => {
  const browser = await puppeteer.launch({
    ...config.browser,
    userDataDir: config.chromeProfilePath, // 크롬 프로필 사용
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  );
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  for (const url of postUrls) {
    try {
      console.log(`\n[${url}] 이동 중...`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });
      await sleep(config.scraping.pageLoadDelay);

      // 팝업 바깥 클릭 및 ESC키로 닫기
      const dialog = await page.$(config.selectors.dialog);
      if (dialog) {
        const box = await dialog.boundingBox();
        if (box) {
          await page.mouse.click(box.x - 10, box.y - 10);
          await sleep(config.scraping.popupCloseDelay);
        }
        await page.keyboard.press('Escape');
        await sleep(config.scraping.popupCloseDelay);
      }

      // "more" 버튼 robust 클릭
      const moreBtn = await page.waitForSelector(config.selectors.moreButton, { timeout: 2000 }).catch(() => null);
      if (moreBtn) {
        await moreBtn.click();
        await sleep(config.scraping.moreButtonDelay);
      }

      // 본문 추출을 위해 임시로 화면 크기 확대
      await page.setViewport({ width: 1200, height: 800 });
      await sleep(1000);

      // 게시글 정보 robust 추출
      const postData = await page.evaluate(() => {
        // 닉네임: span._ap3a._aaco._aacw._aacx._aad7._aade
        let username = '';
        const usernameSelectors = [
          'span._ap3a._aaco._aacw._aacx._aad7._aade',
          'h2 a[role="link"]',
          'header a[role="link"]',
          'header span a',
          'div.x1i10hfl.xjqpnuy.xc5r6h4.xqeqjp1.x1phubyo.xdl72j9.x2lah0s.xe8uvvx.xdj266r.x14z9mp.xat24cr.x1lziwak.x2lwn1j.xeuugli.x1hl2dhg.xggy1nq.x1ja2u2z.x1t137rt.x1q0g3np.x1lku1pv.x1a2a7pz',
          'a[href^="/"][role="link"]',
        ];
        for (const sel of usernameSelectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent) {
            username = el.textContent.trim();
            if (username) break;
          }
        }

        // 본문: span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.xt0psk2.x1i0vuye.xvs91rp.xo1l8bm.x5n08af.x10wh9bi.xpm28yp.x8viiok.x1o7cslx.x126k92a
        let content = '';
        const contentSelectors = [
          'span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.xt0psk2.x1i0vuye.xvs91rp.xo1l8bm.x5n08af.x10wh9bi.xpm28yp.x8viiok.x1o7cslx.x126k92a',
          'h1._ap3a',
          'div[dir="auto"]',
          'span[dir="auto"]',
          'div._a9zs',
          'div._a9zr h1',
          'div._a9zr span',
          'div._a9zr',
        ];
        let contentNode = null;
        for (const sel of contentSelectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent) {
            contentNode = el;
            break;
          }
        }
        let hashtags = [];
        let mentions = [];
        if (contentNode) {
          // 해시태그: a[href*="/explore/tags/"]
          const hashtagLinks = contentNode.querySelectorAll('a[href*="/explore/tags/"]');
          hashtags = Array.from(hashtagLinks).map(a => a.textContent.trim());
          // 멘션: @로 시작하는 a 태그
          const mentionLinks = contentNode.querySelectorAll('a');
          mentions = Array.from(mentionLinks)
            .filter(a => a.textContent.startsWith('@'))
            .map(a => a.textContent.trim());
          // 본문 텍스트는 원본 그대로 유지 (링크 포함)
          content = contentNode.textContent.replace(/\s+/g, ' ').trim();
        }

        // 좋아요 수: span.html-span.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1hl2dhg.x16tdsg8.x1vvkbs
        let likeCount = '';
        const likeSelectors = [
          'span.html-span.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1hl2dhg.x16tdsg8.x1vvkbs',
          'span.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1hl2dhg.x16tdsg8.x1vvkbs',
          'section span[role="button"]',
          'section span',
          'div._aacl._aacp._aacu._aacx._aad7._aade',
          'span[aria-label*="like"]',
          'span',
        ];
        for (const sel of likeSelectors) {
          const el = document.querySelector(sel);
          if (el && /[\d,]+/.test(el.textContent)) {
            likeCount = el.textContent.replace(/[^\d,]/g, '');
            if (likeCount) break;
          }
        }

        // 댓글 수: 여러 방법으로 시도
        let commentCount = 0;
        
        // 방법 1: "View all X comments" 형태에서 숫자 추출
        const commentTextElements = document.querySelectorAll('span');
        for (const el of commentTextElements) {
          const text = el.textContent;
          if (text.includes('comments') && /[\d,]+/.test(text)) {
            const match = text.match(/(\d+(?:,\d+)*)/);
            if (match) {
              commentCount = parseInt(match[1].replace(/,/g, ''));
              break;
            }
          }
        }
        
        // 방법 2: 댓글 섹션에서 직접 숫자 찾기
        if (commentCount === 0) {
          for (const el of commentTextElements) {
            const text = el.textContent;
            if (text.includes('댓글') && /[\d,]+/.test(text)) {
              const match = text.match(/(\d+(?:,\d+)*)/);
              if (match) {
                commentCount = parseInt(match[1].replace(/,/g, ''));
                break;
              }
            }
          }
        }
        
        // 방법 3: 댓글 목록에서 개수 계산
        if (commentCount === 0) {
          const commentSelectors = [
            'ul._a9ym',
            'ul',
            'div[role="list"]',
          ];
          let commentElement = null;
          for (const sel of commentSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              commentElement = el;
              break;
            }
          }
          if (commentElement) {
            let lis = commentElement.querySelectorAll('li._a9zj._a9zl');
            if (lis.length === 0) lis = commentElement.querySelectorAll('li');
            commentCount = lis.length;
          }
        }

        // 게시일자: 여러 선택자 계층적으로 시도
        let uploadDate = '';
        const dateSelectors = [
          'time._a9ze._a9zf',
          'time',
          'a time',
        ];
        for (const sel of dateSelectors) {
          const el = document.querySelector(sel);
          if (el && el.getAttribute('datetime')) {
            uploadDate = el.getAttribute('datetime');
            if (uploadDate) break;
          }
        }

        // 사용자 태그 (사진에 태그된 사용자): div._aa1y 내의 a 태그
        let taggedUsers = [];
        const taggedUserElements = document.querySelectorAll('div._aa1y a[role="link"]');
        taggedUsers = Array.from(taggedUserElements).map(a => a.textContent.trim()).filter(text => text);

        // 위치 정보: a[href*="/explore/locations/"]
        let location = '';
        const locationElement = document.querySelector('a[href*="/explore/locations/"]');
        if (locationElement) {
          location = locationElement.textContent.trim();
        }

        // 미디어 타입 확인 (URL에서 reel/p 구분)
        const hasVideo = window.location.href.includes('/reel/');
        const hasImage = window.location.href.includes('/p/') || document.querySelector('article img') !== null;

        return {
          username,
          content,
          hashtags,
          mentions,
          taggedUsers,
          location,
          likeCount,
          commentCount,
          uploadDate,
          hasVideo,
          hasImage
        };
      });

      // 본문 추출 후 다시 모바일 크기로 복원
      await page.setViewport({ width: 390, height: 844 });
      await sleep(500);

      // 디버깅용 스크린샷
      await page.screenshot({ path: `debug_${Date.now()}.png`, fullPage: true });

      // 첫 번째 이미지/동영상 썸네일만 수집 (캐러셀 슬라이드 없이)
      let mediaUrls = new Set();
      let videoUrls = new Set();
      let thumbnailUrls = new Set();
      
      // 첫 번째 이미지 URL 수집
      const firstImg = await page.$('article img');
      if (firstImg) {
        const imgSrc = await firstImg.evaluate(img => img.src);
        mediaUrls.add(imgSrc);
        if (imgSrc.includes('s150x150')) {
          thumbnailUrls.add(imgSrc);
        }
      }
      
      // 첫 번째 비디오 URL 수집
      const firstVideo = await page.$('article video');
      if (firstVideo) {
        const videoSrc = await firstVideo.evaluate(video => video.src);
        videoUrls.add(videoSrc);
      }

      const imageArr = Array.from(mediaUrls).filter(u => !u.endsWith('.mp4'));
      const videoArr = Array.from(videoUrls).filter(u => u.endsWith('.mp4'));
      const thumbnailArr = Array.from(thumbnailUrls);

      // 결과 출력
      console.log(`\n=== 게시물 정보 ===`);
      console.log(`사용자: ${postData.username}`);
      console.log(`본문: ${postData.content}`);
      console.log(`해시태그: ${postData.hashtags.join(' ')}`);
      console.log(`멘션: ${postData.mentions.join(' ')}`);
      console.log(`사용자 태그: ${postData.taggedUsers.join(' ')}`);
      console.log(`위치: ${postData.location}`);
      console.log(`좋아요: ${postData.likeCount}`);
      console.log(`댓글: ${postData.commentCount}`);
      console.log(`게시일자: ${postData.uploadDate}`);
      console.log(`미디어 타입: ${postData.hasVideo ? '동영상' : '이미지'}${postData.hasVideo && postData.hasImage ? ' + 이미지' : ''}`);
      console.log(`이미지 (${imageArr.length}장):`);
      // imageArr.forEach(url => console.log('  ' + url));
      console.log(`동영상 (${videoArr.length}개):`);
      // videoArr.forEach(url => console.log('  ' + url));
      console.log(`썸네일 (${thumbnailArr.length}개):`);
      // thumbnailArr.forEach(url => console.log('  ' + url));

      // 조사 목적 대기
      await sleep(config.scraping.investigationDelay);

    } catch (error) {
      console.error(`[${url}] 오류:`, error.message);
      await page.screenshot({ path: `error_${Date.now()}.png` });
    }
  }

  await browser.close();
})();
