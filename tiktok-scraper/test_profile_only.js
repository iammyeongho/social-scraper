require('dotenv').config();
const TikTokProfileScraper = require('./scrapers/tiktok_profile_scraper');

async function testProfileScraping() {
  const scraper = new TikTokProfileScraper();
  
  try {
    console.log('=== TikTok 프로필 스크래핑 테스트 (브라우저 열림) ===');
    
    await scraper.initialize();
    console.log('✅ 스크래퍼 초기화 완료');
    
    // 더 간단한 계정으로 테스트
    const username = 'jypapi';
    console.log(`테스트 계정: @${username}`);
    
    const result = await scraper.scrapeProfile(username);
    
    if (result) {
      console.log('\n=== 스크래핑 결과 ===');
      console.log(`사용자명: ${result.username}`);
      console.log(`표시명: ${result.display_name}`);
      console.log(`팔로워: ${result.followers_count?.toLocaleString()}`);
      console.log(`팔로잉: ${result.following_count?.toLocaleString()}`);
      console.log(`게시물 수: ${result.video_count?.toLocaleString()}`);
      console.log(`수집된 게시물 URL: ${result.post_urls?.length || 0}개`);
      console.log(`총 조회수: ${result.total_views_from_posts?.toLocaleString() || 0}`);
      
      if (result.post_urls && result.post_urls.length > 0) {
        console.log('\n=== 수집된 게시물 URL (처음 5개) ===');
        result.post_urls.slice(0, 5).forEach((url, index) => {
          console.log(`${index + 1}. ${url}`);
        });
      } else {
        console.log('\n❌ 게시물 URL을 수집하지 못했습니다.');
        console.log('브라우저가 열려있으니 수동으로 확인해보세요:');
        console.log('1. 페이지가 정상적으로 로드되었는지');
        console.log('2. 게시물들이 보이는지');
        console.log('3. 스크롤이 되는지');
        
        // 10초 대기 후 브라우저 닫기
        console.log('\n10초 후 브라우저를 닫습니다...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
    } else {
      console.log('❌ 스크래핑 실패');
    }
    
  } catch (error) {
    console.error('❌ 테스트 오류:', error.message);
  } finally {
    await scraper.close();
  }
}

testProfileScraping().catch(console.error); 