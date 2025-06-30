const instagram = require('./instagram');
const tiktok = require('./tiktok');

module.exports = {
  // 플랫폼별 설정
  instagram,
  tiktok,
  
  // 공통 설정
  common: {
    // 로깅 설정
    logging: {
      level: 'info', // debug, info, warn, error
      saveScreenshots: true,
      saveErrors: true,
    },
    
    // 데이터 저장 설정
    storage: {
      format: 'json', // json, csv, sqlite
      outputDir: './output',
      filename: 'scraped_data',
    },
    
    // 네트워크 설정
    network: {
      timeout: 30000,
      retries: 3,
      delay: 1000,
    },
  },
}; 