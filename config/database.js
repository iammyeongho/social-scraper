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

  // PostgreSQL 설정 예시
  postgresql: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'social_scraper',
    ssl: false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  },

  // SQLite 설정 예시 (개발용)
  sqlite: {
    filename: process.env.DB_FILE || './data/social_scraper.db',
    verbose: process.env.NODE_ENV === 'development'
  }
}; 