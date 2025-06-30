const config = require('../config').tiktok;

/**
 * TikTok 인플루언서 스크래핑 메인 서비스
 */
class TikTokScraper {
  constructor() {
    this.influencerQueue = [];
    this.isProcessing = false;
    this.results = [];
  }

  /**
   * 서드파티 API에서 받은 인플루언서 ID 목록을 큐에 추가
   * @param {Array} influencerIds - API에서 받은 인플루언서 ID 배열
   */
  addInfluencersToQueue(influencerIds) {
    this.influencerQueue.push(...influencerIds);
    console.log(`큐에 ${influencerIds.length}개의 TikTok 인플루언서 ID가 추가되었습니다.`);
    console.log(`현재 큐 크기: ${this.influencerQueue.length}`);
  }

  /**
   * 큐에서 인플루언서 ID를 가져와서 스크래핑 실행
   */
  async processNextInfluencer() {
    if (this.influencerQueue.length === 0) {
      console.log('처리할 TikTok 인플루언서가 없습니다.');
      return null;
    }

    const apiInfluencerId = this.influencerQueue.shift();
    console.log(`\n=== TikTok 인플루언서 스크래핑 시작: ${apiInfluencerId} ===`);
    
    try {
      // 1. 인플루언서 프로필 정보 수집
      const profileData = await this.scrapeInfluencerProfile(apiInfluencerId);
      
      if (!profileData) {
        console.log(`TikTok 프로필 정보 수집 실패: ${apiInfluencerId}`);
        return null;
      }

      // 2. 인플루언서 게시물 URL 목록 수집 (프로필에서 수집)
      const postUrls = profileData.post_urls || [];
      
      if (postUrls.length === 0) {
        console.log(`TikTok 게시물 URL 수집 실패: ${apiInfluencerId}`);
        return { profile: profileData, posts: [] };
      }

      // 3. 각 게시물 상세 정보 수집
      const postsData = await this.scrapeInfluencerPostDetails(postUrls);

      const result = {
        profile: profileData,
        posts: postsData
      };

      this.results.push(result);
      return result;

    } catch (error) {
      console.error(`TikTok 인플루언서 스크래핑 오류 (${apiInfluencerId}):`, error.message);
      return null;
    }
  }

  /**
   * TikTok 인플루언서 프로필 정보 수집
   * @param {string} apiInfluencerId - API에서 받은 인플루언서 ID
   * @returns {Object} 프로필 데이터
   */
  async scrapeInfluencerProfile(apiInfluencerId) {
    try {
      // TikTok 프로필 스크래퍼 사용
      // TODO: 실제 프로필 스크래핑 로직 구현
      // 현재는 더미 데이터 반환
      return {
        api_influencer_id: apiInfluencerId,
        platform: 'tiktok',
        username: "dummy_tiktok_user",
        display_name: "더미 TikTok 사용자",
        bio: "더미 TikTok 자기소개",
        followers_count: 0,
        following_count: 0,
        likes_count: 0,
        video_count: 0,
        profile_image_url: "",
        is_verified: false,
        is_private: false,
        post_urls: [
          'https://www.tiktok.com/@user/video/7000000000000000001',
          'https://www.tiktok.com/@user/video/7000000000000000002',
        ]
      };
    } catch (error) {
      console.error('TikTok 프로필 스크래핑 오류:', error.message);
      return null;
    }
  }

  /**
   * TikTok 게시물 상세 정보 수집
   * @param {Array} postUrls - 게시물 URL 배열
   * @returns {Array} 게시물 상세 데이터 배열
   */
  async scrapeInfluencerPostDetails(postUrls) {
    const postsData = [];
    
    for (const postUrl of postUrls) {
      try {
        const postData = await this.scrapeSinglePost(postUrl);
        if (postData) {
          postsData.push(postData);
        }
        
        // 요청 간 딜레이
        await this.delay(3000);
        
      } catch (error) {
        console.error(`TikTok 게시물 스크래핑 오류 (${postUrl}):`, error.message);
      }
    }
    
    return postsData;
  }

  /**
   * 단일 TikTok 게시물 스크래핑
   * @param {string} postUrl - 게시물 URL
   * @returns {Object} 게시물 데이터
   */
  async scrapeSinglePost(postUrl) {
    try {
      // TikTok 게시물 스크래퍼 사용
      // TODO: 실제 게시물 스크래핑 로직 구현
      const postId = this.extractPostIdFromUrl(postUrl);
      
      return {
        post_url: postUrl,
        post_id: postId,
        platform: 'tiktok',
        content: "더미 TikTok 게시물 내용",
        hashtags: ["#더미", "#tiktok"],
        mentions: ["@더미유저"],
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        view_count: 0,
        upload_date: new Date().toISOString(),
        video_duration: 30, // 초
        thumbnail_url: "",
        video_url: "",
        music_title: "더미 음악",
        music_artist: "더미 아티스트",
        comments: [] // 댓글 데이터 (필요시)
      };
    } catch (error) {
      console.error('TikTok 단일 게시물 스크래핑 오류:', error.message);
      return null;
    }
  }

  /**
   * TikTok URL에서 게시물 ID 추출
   * @param {string} url - TikTok 게시물 URL
   * @returns {string} 게시물 ID
   */
  extractPostIdFromUrl(url) {
    try {
      const match = url.match(/\/video\/(\d+)/);
      return match ? match[1] : null;
    } catch (error) {
      console.error('TikTok 게시물 ID 추출 오류:', error.message);
      return null;
    }
  }

  /**
   * 전체 TikTok 인플루언서 큐 처리
   */
  async processAllInfluencers() {
    if (this.isProcessing) {
      console.log('이미 TikTok 스크래핑 처리 중입니다.');
      return this.results;
    }

    this.isProcessing = true;
    console.log(`총 ${this.influencerQueue.length}개의 TikTok 인플루언서를 처리합니다.`);

    const results = [];
    
    while (this.influencerQueue.length > 0) {
      const result = await this.processNextInfluencer();
      if (result) {
        results.push(result);
      }
      
      // 인플루언서 간 딜레이
      await this.delay(5000);
    }

    this.isProcessing = false;
    console.log(`\n=== TikTok 스크래핑 완료 ===`);
    console.log(`처리된 TikTok 인플루언서: ${results.length}개`);
    
    return results;
  }

  /**
   * 딜레이 함수
   * @param {number} ms - 밀리초
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 현재 큐 상태 확인
   */
  getQueueStatus() {
    return {
      queueSize: this.influencerQueue.length,
      isProcessing: this.isProcessing,
      processedCount: this.results.length
    };
  }

  /**
   * 결과 가져오기
   */
  getResults() {
    return this.results;
  }

  /**
   * 리소스 정리
   */
  async cleanup() {
    try {
      // 브라우저 인스턴스 정리 등
      console.log('✓ TikTok 스크래퍼 리소스 정리 완료');
    } catch (error) {
      console.error('TikTok 리소스 정리 오류:', error.message);
    }
  }
}

module.exports = TikTokScraper; 