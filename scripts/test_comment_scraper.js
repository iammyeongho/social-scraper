const TikTokCommentScraper = require('../tiktok/tiktok_comment_scraper');

/**
 * 강화된 TikTok 댓글 스크래퍼 테스트
 */
async function testCommentScraper() {
  const scraper = new TikTokCommentScraper();
  
  try {
    console.log('=== TikTok 댓글 스크래퍼 테스트 시작 ===\n');
    
    const initialized = await scraper.initialize();
    if (!initialized) {
      throw new Error('스크래퍼 초기화 실패');
    }
    
    const testUrl = 'https://www.tiktok.com/@changbi_book/video/7517208183597763858';
    console.log(`📱 테스트 URL: ${testUrl}`);
    
    const result = await scraper.scrapeComments(testUrl, 1000); // 최대 1000개 수집
    
    if (result && result.total > 0) {
      await scraper.saveCommentsToFile(result, testUrl);
      
      console.log('\n✅ 스크래핑 성공!');
      console.log(`📊 총 댓글 수: ${result.total}`);
      console.log(`💬 메인 댓글: ${result.mainComments.length}개`);
      console.log(`💬 답글: ${result.replies.length}개`);
      
      // 사용자명 예시 출력
      if (result.mainComments.length > 0) {
        console.log(`\n📝 메인 댓글 사용자명 예시 (최대 5개):`);
        result.mainComments.slice(0, 5).forEach((comment, index) => {
          console.log(`  ${index + 1}. ${comment.username}`);
        });
      }
      
      if (result.replies.length > 0) {
        console.log(`\n💭 답글 사용자명 예시 (최대 5개):`);
        result.replies.slice(0, 5).forEach((reply, index) => {
          console.log(`  ${index + 1}. ${reply.username}`);
        });
      }
      
      // 통계 정보
      const allUsernames = [...result.mainComments, ...result.replies].map(c => c.username);
      const uniqueUsernames = [...new Set(allUsernames)];
      console.log(`\n🧑‍🤝‍🧑 총 고유 사용자 수: ${uniqueUsernames.length}명`);
      
    } else {
      console.log('❌ 댓글 스크래핑 실패 또는 댓글 없음');
    }
    
  } catch (error) {
    console.error('❌ 테스트 중 오류:', error.message);
  } finally {
    await scraper.close();
  }
}

if (require.main === module) {
  testCommentScraper();
}

module.exports = testCommentScraper; 