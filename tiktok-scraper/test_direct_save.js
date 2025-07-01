require('dotenv').config();
const DatabaseService = require('./services/database_service');
const config = require('./config');

async function testDirectSave() {
  const databaseService = new DatabaseService(config.database);
  
  try {
    console.log('=== 직접 데이터베이스 저장 테스트 ===');
    
    await databaseService.connect();
    console.log('✅ 데이터베이스 연결 성공');
    
    // 실제 스크래핑 결과와 유사한 테스트 데이터 생성
    const testResult = {
      profile: {
        api_influencer_id: 'test_user_' + Date.now(),
        username: 'test_user_' + Date.now(),
        display_name: 'Test User',
        bio: 'Test Bio',
        followers_count: 100000,
        following_count: 500,
        likes_count: 1000000,
        video_count: 50,
        profile_image_url: 'https://example.com/avatar.jpg',
        is_verified: false,
        is_private: false,
        total_views_from_posts: 5000000
      },
      posts: [
        {
          post_url: 'https://www.tiktok.com/@test_user/video/1234567890',
          viewCount: 100000,
          view_count: 100000,
          plays: 100000
        },
        {
          post_url: 'https://www.tiktok.com/@test_user/video/1234567891',
          viewCount: 200000,
          view_count: 200000,
          plays: 200000
        },
        {
          post_url: 'https://www.tiktok.com/@test_user/video/1234567892', 
          viewCount: 300000,
          view_count: 300000,
          plays: 300000
        }
      ],
      followers: {
        followers: [],
        total_collected: 0
      },
      detailed_posts: [],
      comments: []
    };
    
    console.log('\n=== 테스트 데이터 ===');
    console.log('프로필:', JSON.stringify(testResult.profile, null, 2));
    console.log('게시물 수:', testResult.posts.length);
    
    // saveInfluencerData 직접 호출 테스트
    console.log('\n🔄 saveInfluencerData 호출 중...');
    const saveResult = await databaseService.saveInfluencerData(testResult);
    
    console.log('✅ 저장 성공!');
    console.log(`  - 프로필 ID: ${saveResult.profileId}`);
    console.log(`  - 저장된 게시물: ${saveResult.savedPosts}/${saveResult.totalPosts}개`);
    
    // 저장된 데이터 확인
    console.log('\n🔍 저장된 데이터 확인...');
    
    const profileQuery = await databaseService.query(
      'SELECT * FROM tiktok_influencer WHERE id = $1', 
      [saveResult.profileId]
    );
    console.log('프로필:', profileQuery.rows[0]);
    
    const postsQuery = await databaseService.query(
      'SELECT * FROM tiktok_post WHERE influencer_id = $1', 
      [saveResult.profileId]
    );
    console.log(`게시물 ${postsQuery.rows.length}개:`);
    postsQuery.rows.forEach((post, index) => {
      console.log(`  ${index + 1}. ${post.post_url} - 조회수: ${post.plays}`);
    });
    
  } catch (error) {
    console.error('❌ 직접 저장 테스트 실패:', error.message);
    console.error('스택 트레이스:', error.stack);
  } finally {
    await databaseService.disconnect();
  }
}

testDirectSave().catch(console.error); 