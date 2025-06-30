const axios = require('axios');

/**
 * 서드파티 API 클라이언트
 * 인플루언서 ID 목록을 받아오는 역할
 */
class ApiClient {
  constructor(apiConfig) {
    this.baseUrl = apiConfig.baseUrl;
    this.apiKey = apiConfig.apiKey;
    this.timeout = apiConfig.timeout || 30000;
    
    // axios 인스턴스 생성
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * 서드파티 API에서 인플루언서 ID 목록을 받아옴
   * @param {Object} params - API 요청 파라미터
   * @returns {Promise<Array>} 인플루언서 ID 배열
   */
  async getInfluencerIds(params = {}) {
    try {
      console.log('서드파티 API에서 인플루언서 ID 목록을 요청합니다...');
      
      // 환경변수나 설정에서 실제 API 사용 여부 확인
      if (process.env.USE_REAL_API === 'true') {
        const response = await this.axiosInstance.get('/api/v1/influencers', { params });
        console.log(`${response.data.length}개의 인플루언서 ID를 받았습니다.`);
        return response.data;
      } else {
        // 더미 데이터 반환 (개발/테스트용)
        const dummyInfluencerIds = [
          'api_influencer_12345',
          'api_influencer_67890',
          'api_influencer_11111',
          'api_influencer_22222',
          'api_influencer_33333'
        ];

        console.log(`${dummyInfluencerIds.length}개의 인플루언서 ID를 받았습니다. (더미 데이터)`);
        return dummyInfluencerIds;
      }

    } catch (error) {
      console.error('API 요청 오류:', error.message);
      throw error;
    }
  }

  /**
   * 특정 인플루언서의 상세 정보를 받아옴
   * @param {string} influencerId - 인플루언서 ID
   * @returns {Promise<Object>} 인플루언서 상세 정보
   */
  async getInfluencerDetails(influencerId) {
    try {
      console.log(`인플루언서 상세 정보 요청: ${influencerId}`);
      
      if (process.env.USE_REAL_API === 'true') {
        const response = await this.axiosInstance.get(`/api/v1/influencers/${influencerId}`);
        return response.data;
      } else {
        // 더미 데이터 반환
        return {
          id: influencerId,
          platform: 'instagram',
          username: 'dummy_username',
          followers: 100000,
          category: 'fashion',
          engagement_rate: 3.5
        };
      }

    } catch (error) {
      console.error('인플루언서 상세 정보 요청 오류:', error.message);
      throw error;
    }
  }

  /**
   * 스크래핑 결과를 API로 전송
   * @param {Object} data - 스크래핑 결과 데이터
   * @returns {Promise<boolean>} 전송 성공 여부
   */
  async sendScrapedData(data) {
    try {
      console.log('스크래핑 결과를 API로 전송합니다...');
      
      if (process.env.USE_REAL_API === 'true') {
        const response = await this.axiosInstance.post('/api/v1/scraped-data', data);
        console.log('스크래핑 결과 전송 완료');
        return response.status === 200;
      } else {
        console.log('스크래핑 결과 전송 완료 (더미 모드)');
        return true;
      }

    } catch (error) {
      console.error('스크래핑 결과 전송 오류:', error.message);
      throw error;
    }
  }

  /**
   * API 상태 확인
   * @returns {Promise<boolean>} API 연결 상태
   */
  async checkApiStatus() {
    try {
      console.log('API 상태 확인 중...');
      
      if (process.env.USE_REAL_API === 'true') {
        const response = await this.axiosInstance.get('/api/v1/health');
        return response.status === 200;
      } else {
        console.log('API 상태 정상 (더미 모드)');
        return true;
      }
    } catch (error) {
      console.error('API 상태 확인 오류:', error.message);
      return false;
    }
  }
}

module.exports = ApiClient; 