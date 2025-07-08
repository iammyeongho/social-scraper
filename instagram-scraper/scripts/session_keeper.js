const { maintainInstagramSession } = require('../scrapers/instagram_login');

/**
 * 인스타그램 세션 유지 스케줄러
 * 주기적으로 세션을 갱신하여 로그아웃을 방지합니다.
 */
class InstagramSessionKeeper {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.keepAliveInterval = 30 * 60 * 1000; // 30분마다 세션 갱신
    this.activityInterval = 5 * 60 * 1000; // 5분마다 활동 수행
  }

  /**
   * 세션 유지 시작
   */
  async start() {
    if (this.isRunning) {
      console.log('세션 유지가 이미 실행 중입니다.');
      return;
    }

    console.log('=== 인스타그램 세션 유지 스케줄러 시작 ===');
    console.log(`세션 갱신 간격: ${this.keepAliveInterval / 60000}분`);
    console.log(`활동 수행 간격: ${this.activityInterval / 60000}분`);

    this.isRunning = true;

    // 초기 세션 확인
    await this.performSessionMaintenance();

    // 주기적 세션 갱신
    this.interval = setInterval(async () => {
      await this.performSessionMaintenance();
    }, this.keepAliveInterval);

    // 주기적 활동 수행
    this.activityInterval = setInterval(async () => {
      await this.performActivity();
    }, this.activityInterval);

    console.log('✓ 세션 유지 스케줄러가 시작되었습니다.');
    console.log('Ctrl+C로 종료할 수 있습니다.');
  }

  /**
   * 세션 유지 수행
   */
  async performSessionMaintenance() {
    try {
      console.log(`\n[${new Date().toLocaleString()}] 세션 유지 수행 중...`);
      await maintainInstagramSession();
      console.log(`[${new Date().toLocaleString()}] ✓ 세션 유지 완료`);
    } catch (error) {
      console.error(`[${new Date().toLocaleString()}] 세션 유지 오류:`, error.message);
    }
  }

  /**
   * 활동 수행 (세션 유지를 위한 간단한 활동)
   */
  async performActivity() {
    try {
      console.log(`[${new Date().toLocaleString()}] 활동 수행 중...`);
      
      // 여기에 간단한 활동을 추가할 수 있습니다
      // 예: 특정 페이지 방문, 스크롤 등
      
      console.log(`[${new Date().toLocaleString()}] ✓ 활동 완료`);
    } catch (error) {
      console.error(`[${new Date().toLocaleString()}] 활동 수행 오류:`, error.message);
    }
  }

  /**
   * 세션 유지 중지
   */
  stop() {
    if (!this.isRunning) {
      console.log('세션 유지가 실행 중이 아닙니다.');
      return;
    }

    console.log('\n=== 세션 유지 스케줄러 중지 ===');
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }

    this.isRunning = false;
    console.log('✓ 세션 유지 스케줄러가 중지되었습니다.');
  }

  /**
   * 상태 확인
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      keepAliveInterval: this.keepAliveInterval,
      activityInterval: this.activityInterval,
      lastMaintenance: new Date().toISOString()
    };
  }
}

// 메인 실행 함수
async function main() {
  const sessionKeeper = new InstagramSessionKeeper();

  // Ctrl+C 처리
  process.on('SIGINT', () => {
    console.log('\n종료 신호를 받았습니다...');
    sessionKeeper.stop();
    process.exit(0);
  });

  // 프로세스 종료 처리
  process.on('SIGTERM', () => {
    console.log('\n프로세스 종료 신호를 받았습니다...');
    sessionKeeper.stop();
    process.exit(0);
  });

  try {
    await sessionKeeper.start();
  } catch (error) {
    console.error('세션 유지 스케줄러 오류:', error.message);
    sessionKeeper.stop();
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = InstagramSessionKeeper; 