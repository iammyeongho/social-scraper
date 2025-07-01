require('dotenv').config();

module.exports = {
  postgres: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'social_scraper',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // 최대 연결 수
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  // AWS RDS 설정 (프로덕션용)
  aws: {
    rds: {
      host: process.env.AWS_RDS_HOST,
      port: process.env.AWS_RDS_PORT || 5432,
      database: process.env.AWS_RDS_DATABASE,
      user: process.env.AWS_RDS_USER,
      password: process.env.AWS_RDS_PASSWORD,
      ssl: true,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }
  }
}; 