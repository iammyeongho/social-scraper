require('dotenv').config();
const DatabaseService = require('./services/database_service');
const config = require('./config');

async function testDatabaseConnection() {
  const dbService = new DatabaseService(config.database);
  
  try {
    console.log('=== 데이터베이스 연결 테스트 ===');
    
    // 1. 연결 테스트
    console.log('1. 데이터베이스 연결 중...');
    await dbService.connect();
    console.log('✅ 데이터베이스 연결 성공');
    
    // 2. 테이블 목록 확인
    console.log('\n2. 테이블 목록 확인...');
    const tablesResult = await dbService.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    console.log('📋 현재 테이블 목록:');
    tablesResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.tablename}`);
    });
    
    // 3. 각 테이블의 레코드 수 확인
    console.log('\n3. 각 테이블의 데이터 수 확인...');
    const importantTables = ['tiktok_influencer', 'tiktok_post', 'tiktok_comments', 'tiktok_followers'];
    
    for (const table of importantTables) {
      try {
        const countResult = await dbService.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(countResult.rows[0].count);
        console.log(`  📊 ${table}: ${count.toLocaleString()}개`);
        
        if (count > 0) {
          // 최근 5개 레코드 확인
          const recentResult = await dbService.query(`
            SELECT * FROM ${table} 
            ORDER BY id DESC 
            LIMIT 5
          `);
          console.log(`    └ 최근 5개 레코드:`);
          recentResult.rows.forEach((row, index) => {
            const summary = table === 'tiktok_influencer' 
              ? `ID=${row.id}, tiktok_id=${row.tiktok_id}, followers=${row.followers}`
              : table === 'tiktok_post'
              ? `ID=${row.id}, influencer_id=${row.influencer_id}, hearts=${row.hearts}, plays=${row.plays}`
              : table === 'tiktok_comments'
              ? `ID=${row.id}, post_id=${row.post_id}, author=${row.author_username}`
              : `ID=${row.id}`;
            console.log(`      ${index + 1}. ${summary}`);
          });
        }
      } catch (error) {
        console.log(`  ❌ ${table}: 테이블이 존재하지 않거나 오류 (${error.message})`);
      }
    }
    
    // 4. 스키마 확인 (최신 통합 스키마와 비교)
    console.log('\n4. tiktok_influencer 테이블 스키마 확인...');
    const schemaResult = await dbService.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'tiktok_influencer' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 tiktok_influencer 컬럼 구조:');
    schemaResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.column_name} (${row.data_type})`);
    });
    
    // 5. 샘플 인플루언서 데이터 삽입 테스트
    console.log('\n5. 샘플 데이터 삽입 테스트...');
    const testProfile = {
      username: 'test_user_' + Date.now(),
      display_name: 'Test User',
      bio: 'Test Bio',
      followers_count: 1000,
      following_count: 100,
      likes_count: 5000,
      video_count: 10,
      profile_image_url: 'https://example.com/avatar.jpg',
      is_verified: false,
      is_private: false
    };
    
    try {
      const profileId = await dbService.saveProfile(testProfile);
      console.log(`✅ 테스트 프로필 저장 성공: profileId=${profileId}`);
      
      // 삽입된 데이터 확인
      const insertedProfile = await dbService.query('SELECT * FROM tiktok_influencer WHERE id = $1', [profileId]);
      console.log('📋 삽입된 프로필 데이터:');
      console.log(JSON.stringify(insertedProfile.rows[0], null, 2));
      
      // 테스트 데이터 삭제
      await dbService.query('DELETE FROM tiktok_influencer WHERE id = $1', [profileId]);
      console.log('🗑️ 테스트 데이터 삭제 완료');
      
    } catch (error) {
      console.error('❌ 테스트 데이터 삽입 실패:', error.message);
      console.error('스택 트레이스:', error.stack);
    }
    
  } catch (error) {
    console.error('❌ 데이터베이스 테스트 실패:', error.message);
    console.error('스택 트레이스:', error.stack);
  } finally {
    await dbService.disconnect();
  }
}

testDatabaseConnection().catch(console.error); 