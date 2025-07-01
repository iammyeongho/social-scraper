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
    
    // 스트림 처리를 위해 데이터베이스 서비스 주입
    this.tiktokScraper.setDatabaseService(this.databaseService);
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
      
      // 3. 데이터베이스 상태 확인
      const dbStatus = await this.databaseService.getStatus();
      console.log('📊 데이터베이스 상태:', dbStatus);

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
      console.log('🔄 1단계: 인플루언서 ID 목록 요청...');
      const influencerIds = await this.apiClient.getInfluencerIds();
      
      console.log(`📋 받아온 인플루언서 ID: ${JSON.stringify(influencerIds)}`);
      
      if (!influencerIds || influencerIds.length === 0) {
        console.log('❌ 처리할 TikTok 인플루언서가 없습니다.');
        return;
      }
      
      console.log(`✅ ${influencerIds.length}개의 TikTok 인플루언서 ID를 받았습니다.`);

      // 2. 인플루언서 ID를 스크래핑 큐에 추가
      console.log('🔄 2단계: 스크래핑 큐에 추가...');
      this.tiktokScraper.addInfluencersToQueue(influencerIds);
      console.log('✅ 스크래핑 큐 추가 완료');

      // 3. 순차적으로 인플루언서 스크래핑 및 데이터 저장
      console.log('🔄 3단계: 인플루언서 스크래핑 실행...');
      const results = await this.tiktokScraper.processAllInfluencers();
      
      console.log(`📊 스크래핑 결과: ${results ? results.length : 0}개`);
      
      if (!results || results.length === 0) {
        console.log('TikTok 스크래핑 결과가 없습니다.');
        return;
      }
      
      // 스크래핑 결과 요약 출력
      console.log('\n=== 스크래핑 결과 요약 ===');
      results.forEach((result, index) => {
        console.log(`${index + 1}. @${result.profile?.username || result.profile?.api_influencer_id}:`);
        console.log(`   - 프로필: ${result.profile ? '✅' : '❌'}`);
        console.log(`   - 게시물: ${result.posts?.length || 0}개`);
        console.log(`   - 상세 게시물: ${result.detailed_posts?.length || 0}개`);
        console.log(`   - 팔로워: ${result.followers?.followers?.length || 0}명`);
        console.log(`   - 댓글: ${result.comments?.length || 0}개 게시물`);
      });

      // 4. 스크래핑 결과 분석 (스트림 처리 vs 배치 처리)
      console.log('\n4단계: 스크래핑 결과 분석...');
      const saveResults = [];
      
      for (const result of results) {
        try {
          console.log(`\n처리 결과 분석: ${result.profile.api_influencer_id}`);
          
          if (result.streamProcessed) {
            // ✅ 스트림 처리된 결과 - 이미 저장 완료
            console.log(`🔄 스트림 처리 완료됨:`);
            console.log(`  - 프로필 ID: ${result.profileId}`);
            console.log(`  - 저장된 게시물: ${result.savedPosts}/${result.totalPosts}개`);
            console.log(`  - 상세 정보 업데이트: ${result.detailedPosts || 0}개`);
            console.log(`  - 저장된 댓글: ${result.savedComments || 0}개 게시물`);
            
            saveResults.push({
              profileId: result.profileId,
              savedPosts: result.savedPosts,
              totalPosts: result.totalPosts,
              detailedPosts: result.detailedPosts || 0,
              savedComments: result.savedComments || 0,
              streamProcessed: true
            });
            
            console.log(`✅ 스트림 처리 결과 확인 완료: ${result.profile.api_influencer_id}`);
            
          } else if (result.legacyProcessed) {
            // ❌ 기존 배치 처리된 결과 - 별도 저장 필요
            console.log(`📦 배치 처리 결과 - 별도 저장 시작:`);
            console.log(`  - 프로필: ✓`);
            console.log(`  - 게시물: ${result.posts?.length || 0}개`);
            console.log(`  - 팔로워: ${result.followers?.followers?.length || 0}명`);
            console.log(`  - 상세 게시물: ${result.detailed_posts?.length || 0}개`);
            console.log(`  - 댓글: ${result.comments?.length || 0}개 게시물`);
            
            // 기존 배치 처리 저장 로직
            const saveResult = await this.databaseService.saveInfluencerData(result);
            console.log(`프로필 저장 완료: profileId=${saveResult.profileId}, 게시물=${saveResult.savedPosts}/${saveResult.totalPosts}개`);
            
            // 팔로워 데이터 저장
            if (result.followers && result.followers.followers && result.followers.followers.length > 0) {
              console.log(` 팔로워 데이터 저장 중: ${result.followers.followers.length}명`);
              const savedFollowers = await this.databaseService.saveFollowersData(saveResult.profileId, result.followers);
              console.log(`팔로워 저장 완료: ${savedFollowers}명`);
            }
            
            saveResults.push(saveResult);
            console.log(`✅ 배치 처리 저장 완료: ${result.profile.api_influencer_id}`);
            
          } else {
            console.log(`⚠️ 알 수 없는 처리 방식: ${result.profile.api_influencer_id}`);
          }
          
        } catch (error) {
          console.error(`💥 결과 처리 실패: ${result.profile.api_influencer_id}`);
          console.error(`오류 상세:`, error.message);
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
    let totalFollowers = 0;
    let totalDetailedPosts = 0;
    let totalComments = 0;
    let totalCommentsCollected = 0;
    
    scrapingResults.forEach(result => {
      totalPosts += result.posts.length;
      if (result.followers && result.followers.followers) {
        totalFollowers += result.followers.followers.length;
      }
      if (result.detailed_posts) {
        totalDetailedPosts += result.detailed_posts.length;
      }
      if (result.comments) {
        totalComments += result.comments.length;
        result.comments.forEach(commentData => {
          totalCommentsCollected += commentData.total || 0;
        });
      }
    });
    
    saveResults.forEach(result => {
      totalSavedPosts += result.savedPosts;
    });
    
    console.log(`총 수집된 TikTok 게시물: ${totalPosts}개`);
    console.log(`성공적으로 저장된 TikTok 게시물: ${totalSavedPosts}개`);
    console.log(`총 수집된 TikTok 팔로워: ${totalFollowers}명`);
    console.log(`상세 정보 수집된 TikTok 게시물: ${totalDetailedPosts}개`);
    console.log(`댓글 수집된 TikTok 게시물: ${totalComments}개`);
    console.log(`총 수집된 TikTok 댓글: ${totalCommentsCollected}개`);
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