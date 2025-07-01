require('dotenv').config();
const TikTokScraper = require('./services/tiktok_scraper');
const ApiClient = require('./services/api_client');
const DatabaseService = require('./services/database_service');
const config = require('./config');

async function testScrapingProcess() {
  console.log('=== 스크래핑 프로세스 단계별 테스트 ===');
  
  try {
    // 1. API 클라이언트 테스트
    console.log('\n1. API 클라이언트 테스트...');
    const apiClient = new ApiClient(config.api.influencerApi);
    
    try {
      console.log('API 상태 확인 중...');
      const apiStatus = await apiClient.checkApiStatus();
      console.log(`API 상태: ${apiStatus ? '✅ 정상' : '❌ 오류'}`);
      
      console.log('인플루언서 ID 목록 요청 중...');
      const influencerIds = await apiClient.getInfluencerIds();
      console.log(`받은 인플루언서 ID: ${JSON.stringify(influencerIds)}`);
      console.log(`인플루언서 수: ${influencerIds ? influencerIds.length : 0}개`);
      
    } catch (error) {
      console.error('❌ API 클라이언트 오류:', error.message);
      // API 오류여도 계속 진행 (테스트 데이터로)
    }
    
    // 2. 데이터베이스 연결 테스트
    console.log('\n2. 데이터베이스 연결 테스트...');
    const databaseService = new DatabaseService(config.database);
    await databaseService.connect();
    console.log('✅ 데이터베이스 연결 성공');
    
    // 3. TikTok 스크래퍼 테스트 (실제 사용자로)
    console.log('\n3. TikTok 스크래퍼 테스트...');
    const tiktokScraper = new TikTokScraper();
    
    // 테스트할 인플루언서 ID (실제 공개 계정)
    const testInfluencerIds = ['jypapi']; // JYP 공식 계정 (팔로워 많고 공개)
    
    console.log(`테스트 인플루언서: ${testInfluencerIds}`);
    tiktokScraper.addInfluencersToQueue(testInfluencerIds);
    
    console.log('스크래핑 시작...');
    const results = await tiktokScraper.processAllInfluencers();
    
    console.log(`스크래핑 결과: ${results ? results.length : 0}개`);
    
    if (results && results.length > 0) {
      console.log('\n=== 스크래핑 결과 상세 ===');
      results.forEach((result, index) => {
        console.log(`\n인플루언서 ${index + 1}:`);
        console.log(`  - API ID: ${result.profile?.api_influencer_id}`);
        console.log(`  - 사용자명: ${result.profile?.username}`);
        console.log(`  - 팔로워: ${result.profile?.followers_count?.toLocaleString()}`);
        console.log(`  - 프로필: ${result.profile ? '✅' : '❌'}`);
        console.log(`  - 게시물: ${result.posts?.length || 0}개`);
        console.log(`  - 상세 게시물: ${result.detailed_posts?.length || 0}개`);
        console.log(`  - 팔로워: ${result.followers?.followers?.length || 0}명`);
        console.log(`  - 댓글: ${result.comments?.length || 0}개 게시물`);
        
        // 첫 번째 게시물 샘플 출력
        if (result.posts && result.posts.length > 0) {
          console.log(`  - 첫 번째 게시물 샘플:`);
          const firstPost = result.posts[0];
          console.log(`    URL: ${firstPost.post_url}`);
          console.log(`    조회수: ${firstPost.viewCount || firstPost.view_count || firstPost.plays || 0}`);
        }
      });
      
      // 4. 데이터베이스 저장 테스트
      console.log('\n4. 데이터베이스 저장 테스트...');
      
      for (const result of results) {
        try {
          console.log(`\n인플루언서 저장 시작: ${result.profile.api_influencer_id}`);
          
          console.log('saveInfluencerData 호출 중...');
          const saveResult = await databaseService.saveInfluencerData(result);
          console.log(`✅ 기본 데이터 저장 성공: profileId=${saveResult.profileId}`);
          
          // 저장 결과 확인
          const savedProfile = await databaseService.query(
            'SELECT * FROM tiktok_influencer WHERE id = $1', 
            [saveResult.profileId]
          );
          console.log(`✅ 프로필 확인: ${savedProfile.rows[0].tiktok_name} (ID: ${savedProfile.rows[0].id})`);
          
          const savedPosts = await databaseService.query(
            'SELECT COUNT(*) as count FROM tiktok_post WHERE influencer_id = $1', 
            [saveResult.profileId]
          );
          console.log(`✅ 게시물 확인: ${savedPosts.rows[0].count}개`);
          
        } catch (error) {
          console.error(`❌ 데이터베이스 저장 오류: ${result.profile.api_influencer_id}`);
          console.error(`오류 상세:`, error.message);
          console.error(`스택 트레이스:`, error.stack);
        }
      }
      
    } else {
      console.log('❌ 스크래핑 결과가 없습니다.');
    }
    
    await tiktokScraper.cleanup();
    await databaseService.disconnect();
    
  } catch (error) {
    console.error('❌ 테스트 프로세스 오류:', error.message);
    console.error('스택 트레이스:', error.stack);
  }
}

testScrapingProcess().catch(console.error); 