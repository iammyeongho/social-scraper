/**
 * 서드파티 API 설정
 */
module.exports = {
  // 인플루언서 데이터 제공 API 설정
  influencerApi: {
    baseUrl: process.env.API_BASE_URL || 'https://api.example.com',
    apiKey: process.env.API_KEY || 'your_api_key_here',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  },

  // API 엔드포인트 설정
  endpoints: {
    getInfluencers: '/v1/influencers',
    getInfluencerDetails: '/v1/influencers/{id}',
    getInfluencerPosts: '/v1/influencers/{id}/posts',
    healthCheck: '/health'
  },

  // API 요청 헤더 설정
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'SocialScraper/1.0'
  }
}; 