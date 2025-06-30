require('dotenv').config();

const TikTokScraper = require('./services/tiktok_scraper');
const ApiClient = require('./services/api_client');
const DatabaseService = require('./services/database_service');
const config = require('./config');

/**
 * TikTok 스크래핑 시스템
 */
class TikTokScrapingSystem {
  constructor() {
    this.apiClient = new ApiClient(config.api.influencerApi);
    this.databaseService = new DatabaseService(config.database);
    this.tiktokScraper = new TikTokScraper();
  }

  /**
   * 시스템 초기화
   */
  async initialize() {
    try {
      console.log('=== TikTok 스크래핑 시스템 초기화 ===');
      
      // 1. API 상태 확인
      const apiStatus = await this.apiClient.checkApiStatus();
      if (!apiStatus) {
        throw new Error('TikTok API 연결 실패');
      }
      console.log('✓ TikTok API 연결 성공');

      // 2. 데이터베이스 연결
      await this.databaseService.connect();
      console.log('✓ TikTok 데이터베이스 연결 성공');

      console.log('=== TikTok 시스템 초기화 완료 ===\n');
      return true;

    } catch (error) {
      console.error('TikTok 시스템 초기화 오류:', error.message);
      return false;
    }
  }

  /**
   * 전체 TikTok 스크래핑 프로세스 실행
   */
  async runScrapingProcess() {
    try {
      console.log('=== TikTok 스크래핑 프로세스 시작 ===');

      // 1. 서드파티 API에서 TikTok 인플루언서 ID 목록 받아오기
      const influencerIds = await this.apiClient.getInfluencerIds();
      
      if (!influencerIds || influencerIds.length === 0) {
        console.log('처리할 TikTok 인플루언서가 없습니다.');
        return;
      }

      // 2. 인플루언서 ID를 스크래핑 큐에 추가
      this.tiktokScraper.addInfluencersToQueue(influencerIds);

      // 3. 순차적으로 인플루언서 스크래핑 및 데이터 저장
      const results = await this.tiktokScraper.processAllInfluencers();
      
      if (!results || results.length === 0) {
        console.log('TikTok 스크래핑 결과가 없습니다.');
        return;
      }

      // 4. 스크래핑 결과를 데이터베이스에 저장
      console.log('\n=== TikTok 데이터베이스 저장 시작 ===');
      const saveResults = [];
      
      for (const result of results) {
        try {
          const saveResult = await this.databaseService.saveInfluencerData(result);
          saveResults.push(saveResult);
          console.log(`✓ TikTok 인플루언서 데이터 저장 완료: ${result.profile.api_influencer_id}`);
        } catch (error) {
          console.error(`✗ TikTok 인플루언서 데이터 저장 실패: ${result.profile.api_influencer_id}`, error.message);
        }
      }

      // 5. 결과를 API로 전송
      await this.sendResultsToApi(results);

      // 6. 결과 요약
      this.printSummary(results, saveResults);

    } catch (error) {
      console.error('TikTok 스크래핑 프로세스 오류:', error.message);
    }
  }

  /**
   * 결과를 서드파티 API로 전송
   * @param {Array} results - TikTok 스크래핑 결과
   */
  async sendResultsToApi(results) {
    try {
      console.log('\n=== TikTok API 결과 전송 시작 ===');
      
      for (const result of results) {
        try {
          await this.apiClient.sendScrapedData(result);
          console.log(`✓ TikTok API 전송 완료: ${result.profile.api_influencer_id}`);
        } catch (error) {
          console.error(`✗ TikTok API 전송 실패: ${result.profile.api_influencer_id}`, error.message);
        }
      }
    } catch (error) {
      console.error('TikTok API 전송 오류:', error.message);
    }
  }

  /**
   * TikTok 스크래핑 결과 요약 출력
   */
  printSummary(scrapingResults, saveResults) {
    console.log('\n=== TikTok 스크래핑 결과 요약 ===');
    console.log(`총 처리된 TikTok 인플루언서: ${scrapingResults.length}개`);
    console.log(`성공적으로 저장된 TikTok 인플루언서: ${saveResults.length}개`);
    
    let totalPosts = 0;
    let totalSavedPosts = 0;
    
    scrapingResults.forEach(result => {
      totalPosts += result.posts.length;
    });
    
    saveResults.forEach(result => {
      totalSavedPosts += result.savedPosts;
    });
    
    console.log(`총 수집된 TikTok 게시물: ${totalPosts}개`);
    console.log(`성공적으로 저장된 TikTok 게시물: ${totalSavedPosts}개`);
    console.log('=== TikTok 프로세스 완료 ===\n');
  }

  /**
   * 시스템 정리
   */
  async cleanup() {
    try {
      console.log('=== TikTok 시스템 정리 중 ===');
      await this.tiktokScraper.cleanup();
      await this.databaseService.disconnect();
      console.log('✓ TikTok 시스템 정리 완료');
    } catch (error) {
      console.error('TikTok 시스템 정리 오류:', error.message);
    }
  }

  /**
   * TikTok 시스템 상태 확인
   */
  async getSystemStatus() {
    try {
      const apiStatus = await this.apiClient.checkApiStatus();
      const dbStatus = await this.databaseService.getStatus();
      const queueStatus = this.tiktokScraper.getQueueStatus();

      return {
        api: apiStatus,
        database: dbStatus,
        queue: queueStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('TikTok 시스템 상태 확인 오류:', error.message);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  const system = new TikTokScrapingSystem();
  
  try {
    // 시스템 초기화
    const initialized = await system.initialize();
    if (!initialized) {
      console.error('TikTok 시스템 초기화 실패');
      process.exit(1);
    }

    // TikTok 스크래핑 프로세스 실행
    await system.runScrapingProcess();

  } catch (error) {
    console.error('TikTok 메인 프로세스 오류:', error.message);
  } finally {
    // 시스템 정리
    await system.cleanup();
  }
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
  main().catch(error => {
    console.error('TikTok 치명적 오류:', error.message);
    process.exit(1);
  });
}

module.exports = TikTokScrapingSystem; 