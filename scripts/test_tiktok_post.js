const TikTokPostScraper = require('../tiktok/tiktok_post_scraper');
const fs = require('fs');
const path = require('path');

/**
 * 틱톡 게시물 스크래핑 테스트
 */
async function testTikTokPostScraping() {
  const scraper = new TikTokPostScraper();
  
  try {
    // 스크래퍼 초기화
    const initialized = await scraper.initialize();
    if (!initialized) {
      console.error('스크래퍼 초기화 실패');
      return;
    }

    // 테스트할 게시물 URL (사용자 요청)
    const testPostUrl = 'https://www.tiktok.com/@hearts2hearts/video/7519501221162503431';
    
    console.log('=== 틱톡 게시물 스크래핑 테스트 ===');
    console.log(`테스트 URL: ${testPostUrl}`);
    
    // 단일 게시물 스크래핑
    const postData = await scraper.scrapePost(testPostUrl);
    
    if (postData) {
      console.log('\n=== 스크래핑 결과 ===');
      console.log(`게시물 URL: ${postData.post_url}`);
      console.log(`작성자: @${postData.username}`);
      console.log(`디스플레이명: ${postData.display_name}`);
      console.log(`내용: ${postData.content.substring(0, 100)}...`);
      console.log(`좋아요: ${postData.like_count}`);
      console.log(`댓글: ${postData.comment_count}`);
      console.log(`공유: ${postData.share_count}`);
      console.log(`북마크: ${postData.bookmark_count}`);
      console.log(`조회수: ${postData.view_count}`);
      console.log(`업로드 날짜: ${postData.upload_date}`);
      console.log(`비디오 길이: ${postData.video_duration}`);
      console.log(`해시태그: ${postData.hashtags.join(', ')}`);
      console.log(`멘션: ${postData.mentions.join(', ')}`);
      console.log(`음악: ${postData.music_title} - ${postData.music_artist}`);
      console.log(`인증됨: ${postData.is_verified}`);
      console.log(`비공개: ${postData.is_private}`);
      console.log(`위치: ${postData.location}`);
      
      // 결과를 JSON 파일로 저장
      const outputDir = 'output';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
      }
      
      const filename = `tiktok_post_${postData.username}_${Date.now()}.json`;
      const filepath = path.join(outputDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(postData, null, 2), 'utf8');
      console.log(`\n✓ 결과가 ${filepath}에 저장되었습니다.`);
      
    } else {
      console.error('게시물 스크래핑 실패');
    }

  } catch (error) {
    console.error('테스트 중 오류 발생:', error.message);
  } finally {
    // 브라우저 종료
    await scraper.close();
  }
}

// 스크립트 실행
if (require.main === module) {
  testTikTokPostScraping();
}

module.exports = { testTikTokPostScraping }; 