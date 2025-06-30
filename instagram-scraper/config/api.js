require('dotenv').config();

module.exports = {
  influencerApi: {
    baseUrl: process.env.API_BASE_URL || 'https://api.example.com',
    apiKey: process.env.API_KEY || '',
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000,
    
    endpoints: {
      getInfluencers: '/api/v1/influencers',
      updateInfluencer: '/api/v1/influencers/{id}',
      reportStatus: '/api/v1/status'
    }
  },

  // AWS API Gateway 설정 (프로덕션용)
  aws: {
    apiGateway: {
      baseUrl: process.env.AWS_API_GATEWAY_URL,
      apiKey: process.env.AWS_API_KEY,
      region: process.env.AWS_REGION || 'ap-northeast-2'
    }
  }
}; 