const MainScrapingSystem = require('../main');

/**
 * 시스템 테스트 스크립트
 */
async function testSystem() {
  console.log('=== 시스템 테스트 시작 ===\n');
  
  const system = new MainScrapingSystem();
  
  try {
    // 1. 시스템 초기화 테스트
    console.log('1. 시스템 초기화 테스트...');
    const initialized = await system.initialize();
    if (!initialized) {
      throw new Error('시스템 초기화 실패');
    }
    console.log('✓ 시스템 초기화 성공\n');

    // 2. 시스템 상태 확인 테스트
    console.log('2. 시스템 상태 확인 테스트...');
    const status = await system.getSystemStatus();
    console.log('시스템 상태:', JSON.stringify(status, null, 2));
    console.log('✓ 시스템 상태 확인 성공\n');

    // 3. API 클라이언트 테스트
    console.log('3. API 클라이언트 테스트...');
    const influencerIds = await system.apiClient.getInfluencerIds();
    console.log(`받은 인플루언서 ID: ${influencerIds.length}개`);
    console.log('✓ API 클라이언트 테스트 성공\n');

    // 4. 데이터베이스 서비스 테스트
    console.log('4. 데이터베이스 서비스 테스트...');
    const dbStatus = await system.databaseService.getStatus();
    console.log('데이터베이스 상태:', JSON.stringify(dbStatus, null, 2));
    console.log('✓ 데이터베이스 서비스 테스트 성공\n');

    // 5. 인플루언서 스크래퍼 테스트
    console.log('5. 인플루언서 스크래퍼 테스트...');
    const queueStatus = system.influencerScraper.getQueueStatus();
    console.log('큐 상태:', JSON.stringify(queueStatus, null, 2));
    console.log('✓ 인플루언서 스크래퍼 테스트 성공\n');

    // 6. 전체 프로세스 테스트 (더미 데이터)
    console.log('6. 전체 프로세스 테스트 (더미 데이터)...');
    system.influencerScraper.addInfluencersToQueue(['test_influencer_1', 'test_influencer_2']);
    const results = await system.influencerScraper.processAllInfluencers();
    console.log(`처리된 인플루언서: ${results.length}개`);
    console.log('✓ 전체 프로세스 테스트 성공\n');

    console.log('=== 모든 테스트 통과! ===');

  } catch (error) {
    console.error('테스트 실패:', error.message);
    console.error('스택 트레이스:', error.stack);
  } finally {
    // 시스템 정리
    await system.cleanup();
  }
}

// 테스트 실행
if (require.main === module) {
  testSystem().catch(error => {
    console.error('테스트 실행 오류:', error.message);
    process.exit(1);
  });
}

module.exports = testSystem; 