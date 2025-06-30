/**
 * 데이터베이스 설정
 */
module.exports = {
  // MySQL 설정 예시
  mysql: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'social_scraper',
    charset: 'utf8mb4',
    timezone: '+09:00',
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
  },

  // PostgreSQL 설정 (추천)
  postgresql: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'scraper_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'social_scraper',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // 연결 풀 최대 크기
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
    query_timeout: 30000,
    application_name: 'social_scraper'
  },

  // 개발용 설정
  development: {
    host: 'localhost',
    port: 5432,
    user: 'scraper_user',
    password: 'dev_password',
    database: 'social_scraper_dev',
    ssl: false,
    max: 5
  },

  // 프로덕션용 설정
  production: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  },

  // SQLite 설정 예시 (개발용)
  sqlite: {
    filename: process.env.DB_FILE || './data/social_scraper.db',
    verbose: process.env.NODE_ENV === 'development'
  }
}; 