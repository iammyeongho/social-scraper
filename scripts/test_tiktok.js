const TikTokProfileScraper = require('../tiktok/tiktok_profile_scraper');
const TikTokPostScraper = require('../tiktok/tiktok_post_scraper');
const fs = require('fs').promises;
const path = require('path');

/**
 * 틱톡 스크래핑 테스트 스크립트
 */
async function testTikTokScraping() {
  console.log('=== 틱톡 스크래핑 테스트 시작 ===\n');
  
  const testUsername = 'test_user'; // 테스트용 사용자명
  const testPostUrl = 'https://www.tiktok.com/@test_user/video/test123'; // 테스트용 게시물 URL
  
  let profileScraper = null;
  let postScraper = null;
  
  try {
    // 1. 프로필 스크래핑 테스트
    console.log('1. 프로필 스크래핑 테스트...');
    profileScraper = new TikTokProfileScraper();
    
    const profileInitialized = await profileScraper.initialize();
    if (!profileInitialized) {
      throw new Error('프로필 스크래퍼 초기화 실패');
    }
    
    const profileData = await profileScraper.scrapeProfile(testUsername);
    if (profileData) {
      console.log('✓ 프로필 스크래핑 성공');
      console.log('프로필 데이터:', JSON.stringify(profileData, null, 2));
      
      // 결과를 파일로 저장
      await fs.writeFile(
        path.join(__dirname, '../output/tiktok_profile_test.json'),
        JSON.stringify(profileData, null, 2),
        'utf8'
      );
      console.log('✓ 프로필 데이터가 output/tiktok_profile_test.json에 저장되었습니다.\n');
    } else {
      console.log('✗ 프로필 스크래핑 실패\n');
    }
    
    // 프로필 스크래퍼 종료
    await profileScraper.close();
    
    // 2. 게시물 스크래핑 테스트
    console.log('2. 게시물 스크래핑 테스트...');
    postScraper = new TikTokPostScraper();
    
    const postInitialized = await postScraper.initialize();
    if (!postInitialized) {
      throw new Error('게시물 스크래퍼 초기화 실패');
    }
    
    const postData = await postScraper.scrapePost(testPostUrl);
    if (postData) {
      console.log('✓ 게시물 스크래핑 성공');
      console.log('게시물 데이터:', JSON.stringify(postData, null, 2));
      
      // 결과를 파일로 저장
      await fs.writeFile(
        path.join(__dirname, '../output/tiktok_post_test.json'),
        JSON.stringify(postData, null, 2),
        'utf8'
      );
      console.log('✓ 게시물 데이터가 output/tiktok_post_test.json에 저장되었습니다.\n');
    } else {
      console.log('✗ 게시물 스크래핑 실패\n');
    }
    
    // 3. 여러 게시물 스크래핑 테스트
    console.log('3. 여러 게시물 스크래핑 테스트...');
    const testPostUrls = [
      'https://www.tiktok.com/@test_user/video/test1',
      'https://www.tiktok.com/@test_user/video/test2',
      'https://www.tiktok.com/@test_user/video/test3'
    ];
    
    const multiplePostsData = await postScraper.scrapeMultiplePosts(testPostUrls);
    console.log(`✓ ${multiplePostsData.length}개의 게시물 스크래핑 완료`);
    
    // 결과를 파일로 저장
    await fs.writeFile(
      path.join(__dirname, '../output/tiktok_multiple_posts_test.json'),
      JSON.stringify(multiplePostsData, null, 2),
      'utf8'
    );
    console.log('✓ 여러 게시물 데이터가 output/tiktok_multiple_posts_test.json에 저장되었습니다.\n');
    
    console.log('=== 모든 틱톡 스크래핑 테스트 완료 ===');

  } catch (error) {
    console.error('틱톡 스크래핑 테스트 오류:', error.message);
    console.error('스택 트레이스:', error.stack);
  } finally {
    // 스크래퍼들 정리
    if (profileScraper) {
      await profileScraper.close();
    }
    if (postScraper) {
      await postScraper.close();
    }
  }
}

/**
 * 실제 사용자명으로 테스트
 * @param {string} username - 실제 틱톡 사용자명
 */
async function testWithRealUsername(username) {
  console.log(`=== 실제 사용자명으로 테스트: @${username} ===\n`);
  
  const profileScraper = new TikTokProfileScraper();
  
  try {
    const initialized = await profileScraper.initialize();
    if (!initialized) {
      throw new Error('프로필 스크래퍼 초기화 실패');
    }
    
    const profileData = await profileScraper.scrapeProfile(username);
    if (profileData) {
      console.log('✓ 실제 프로필 스크래핑 성공');
      console.log('프로필 데이터:', JSON.stringify(profileData, null, 2));
      
      // 결과를 파일로 저장
      await fs.writeFile(
        path.join(__dirname, `../output/tiktok_profile_${username}.json`),
        JSON.stringify(profileData, null, 2),
        'utf8'
      );
      console.log(`✓ 프로필 데이터가 output/tiktok_profile_${username}.json에 저장되었습니다.`);
      
      // 게시물 URL이 있으면 첫 번째 게시물 테스트
      if (profileData.post_urls && profileData.post_urls.length > 0) {
        console.log('\n첫 번째 게시물 스크래핑 테스트...');
        const postScraper = new TikTokPostScraper();
        
        const postInitialized = await postScraper.initialize();
        if (postInitialized) {
          const firstPostUrl = profileData.post_urls[0];
          console.log(`첫 번째 게시물 URL: ${firstPostUrl}`);
          
          const postData = await postScraper.scrapePost(firstPostUrl);
          
          if (postData) {
            console.log('✓ 첫 번째 게시물 스크래핑 성공');
            console.log('게시물 데이터:', JSON.stringify(postData, null, 2));
            await fs.writeFile(
              path.join(__dirname, `../output/tiktok_post_${username}_first.json`),
              JSON.stringify(postData, null, 2),
              'utf8'
            );
            console.log(`✓ 게시물 데이터가 output/tiktok_post_${username}_first.json에 저장되었습니다.`);
          } else {
            console.log('✗ 첫 번째 게시물 스크래핑 실패');
          }
          
          await postScraper.close();
        }
      } else {
        console.log('수집된 게시물 URL이 없습니다.');
      }
      
    } else {
      console.log('✗ 실제 프로필 스크래핑 실패');
    }
    
  } catch (error) {
    console.error('실제 사용자명 테스트 오류:', error.message);
  } finally {
    await profileScraper.close();
  }
}

/**
 * 디버깅을 위한 페이지 요소 확인
 * @param {string} username - 틱톡 사용자명
 */
async function debugPageElements(username) {
  console.log(`=== 페이지 요소 디버깅: @${username} ===\n`);
  
  const profileScraper = new TikTokProfileScraper();
  
  try {
    const initialized = await profileScraper.initialize();
    if (!initialized) {
      throw new Error('프로필 스크래퍼 초기화 실패');
    }
    
    const profileUrl = `https://www.tiktok.com/@${username}`;
    await profileScraper.page.goto(profileUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await profileScraper.delay(3000);
    
    // 페이지 요소 확인
    const pageInfo = await profileScraper.page.evaluate(() => {
      const info = {
        title: document.title,
        url: window.location.href,
        elements: {}
      };
      
      // 비즈니스 계정 관련 요소들
      info.elements.verifiedBadges = {
        svgCircle: document.querySelectorAll('svg[width="20"][height="20"] circle[fill="#20D5EC"]').length,
        svgPath: document.querySelectorAll('svg path[d*="M37.1213 15.8787"]').length,
        dataE2E: document.querySelectorAll('[data-e2e*="verified"]').length,
        allSvg: document.querySelectorAll('svg').length
      };
      
      // 게시물 링크 관련 요소들
      info.elements.videoLinks = {
        allLinks: document.querySelectorAll('a').length,
        videoLinks: document.querySelectorAll('a[href*="/video/"]').length,
        postItems: document.querySelectorAll('[data-e2e="user-post-item"]').length,
        postItemLinks: document.querySelectorAll('[data-e2e="user-post-item"] a').length
      };
      
      // 프로필 정보 요소들
      info.elements.profileInfo = {
        username: document.querySelector('[data-e2e="user-title"]') ? 'found' : 'not found',
        displayName: document.querySelector('[data-e2e="user-subtitle"]') ? 'found' : 'not found',
        bio: document.querySelector('[data-e2e="user-bio"]') ? 'found' : 'not found',
        followers: document.querySelector('[data-e2e="followers-count"]') ? 'found' : 'not found',
        following: document.querySelector('[data-e2e="following-count"]') ? 'found' : 'not found',
        likes: document.querySelector('[data-e2e="likes-count"]') ? 'found' : 'not found'
      };
      
      return info;
    });
    
    console.log('페이지 정보:', JSON.stringify(pageInfo, null, 2));
    
    // 스크린샷 저장
    await profileScraper.page.screenshot({ 
      path: `debug_tiktok_${username}_${Date.now()}.png`,
      fullPage: true 
    });
    console.log('✓ 디버깅 스크린샷 저장 완료');
    
  } catch (error) {
    console.error('디버깅 오류:', error.message);
  } finally {
    await profileScraper.close();
  }
}

// 스크립트 실행
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    if (args[0] === 'debug' && args[1]) {
      // 디버깅 모드
      debugPageElements(args[1]).catch(error => {
        console.error('디버깅 실행 오류:', error.message);
        process.exit(1);
      });
    } else {
      // 실제 사용자명으로 테스트
      const username = args[0];
      testWithRealUsername(username).catch(error => {
        console.error('테스트 실행 오류:', error.message);
        process.exit(1);
      });
    }
  } else {
    // 기본 테스트 실행
    testTikTokScraping().catch(error => {
      console.error('테스트 실행 오류:', error.message);
      process.exit(1);
    });
  }
}

module.exports = { testTikTokScraping, testWithRealUsername, debugPageElements }; 