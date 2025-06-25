const instagramPostScraper = require('../instagram/instagram_post_scraper');
const instagramProfileScraper = require('../instagram/instagram_profile_scraper');
const tiktokPostScraper = require('../tiktok/tiktok_post_scraper');
const tiktokProfileScraper = require('../tiktok/tiktok_profile_scraper');
const config = require('../config').instagram;

/**
 * 인플루언서 스크래핑 메인 서비스
 */
class InfluencerScraper {
  constructor() {
    this.influencerQueue = [];
    this.isProcessing = false;
    this.tiktokProfileScraper = null;
    this.tiktokPostScraper = null;
  }

  /**
   * 서드파티 API에서 받은 인플루언서 ID 목록을 큐에 추가
   * @param {Array} influencerIds - API에서 받은 인플루언서 ID 배열
   */
  addInfluencersToQueue(influencerIds) {
    this.influencerQueue.push(...influencerIds);
    console.log(`큐에 ${influencerIds.length}개의 인플루언서 ID가 추가되었습니다.`);
    console.log(`현재 큐 크기: ${this.influencerQueue.length}`);
  }

  /**
   * 큐에서 인플루언서 ID를 가져와서 스크래핑 실행
   */
  async processNextInfluencer() {
    if (this.influencerQueue.length === 0) {
      console.log('처리할 인플루언서가 없습니다.');
      return null;
    }

    const apiInfluencerId = this.influencerQueue.shift();
    console.log(`\n=== 인플루언서 스크래핑 시작: ${apiInfluencerId} ===`);
    
    try {
      // 1. 인플루언서 프로필 정보 수집
      const profileData = await this.scrapeInfluencerProfile(apiInfluencerId);
      
      if (!profileData) {
        console.log(`프로필 정보 수집 실패: ${apiInfluencerId}`);
        return null;
      }

      // 2. 인플루언서 게시물 URL 목록 수집
      const postUrls = await this.scrapeInfluencerPosts(apiInfluencerId);
      
      if (!postUrls || postUrls.length === 0) {
        console.log(`게시물 URL 수집 실패: ${apiInfluencerId}`);
        return { profile: profileData, posts: [] };
      }

      // 3. 각 게시물 상세 정보 수집
      const postsData = await this.scrapeInfluencerPostDetails(postUrls);

      return {
        profile: profileData,
        posts: postsData
      };

    } catch (error) {
      console.error(`인플루언서 스크래핑 오류 (${apiInfluencerId}):`, error.message);
      return null;
    }
  }

  /**
   * 인플루언서 프로필 정보 수집
   * @param {string} apiInfluencerId - API에서 받은 인플루언서 ID
   * @returns {Object} 프로필 데이터
   */
  async scrapeInfluencerProfile(apiInfluencerId) {
    try {
      // TODO: 실제 프로필 스크래핑 로직 구현
      // 현재는 더미 데이터 반환
      return {
        api_influencer_id: apiInfluencerId,
        platform: 'instagram', // 또는 'tiktok'
        username: "dummy_username",
        bio: "더미 자기소개",
        followers_count: 0,
        following_count: 0,
        posts_count: 0,
        profile_image_url: "",
        is_verified: false,
        is_private: false
      };
    } catch (error) {
      console.error('프로필 스크래핑 오류:', error.message);
      return null;
    }
  }

  /**
   * 인플루언서 게시물 URL 목록 수집
   * @param {string} apiInfluencerId - API에서 받은 인플루언서 ID
   * @returns {Array} 게시물 URL 배열
   */
  async scrapeInfluencerPosts(apiInfluencerId) {
    try {
      // TODO: 실제 프로필 스크래핑 로직 구현
      // 현재는 더미 URL 반환
      return [
        "https://www.instagram.com/p/dummy1/",
        "https://www.instagram.com/reel/dummy2/",
        "https://www.instagram.com/tv/dummy3/"
      ];
    } catch (error) {
      console.error('게시물 URL 수집 오류:', error.message);
      return [];
    }
  }

  /**
   * 게시물 상세 정보 수집
   * @param {Array} postUrls - 게시물 URL 배열
   * @returns {Array} 게시물 상세 데이터 배열
   */
  async scrapeInfluencerPostDetails(postUrls) {
    const postsData = [];
    
    for (const postUrl of postUrls) {
      try {
        // 기존 스크래핑 코드 활용
        const postData = await this.scrapeSinglePost(postUrl);
        if (postData) {
          postsData.push(postData);
        }
        
        // 요청 간 딜레이
        await this.delay(1000);
        
      } catch (error) {
        console.error(`게시물 스크래핑 오류 (${postUrl}):`, error.message);
      }
    }
    
    return postsData;
  }

  /**
   * 단일 게시물 스크래핑 (기존 코드 활용)
   * @param {string} postUrl - 게시물 URL
   * @returns {Object} 게시물 데이터
   */
  async scrapeSinglePost(postUrl) {
    try {
      // 플랫폼별 스크래핑 분기
      if (postUrl.includes('instagram.com')) {
        // TODO: 기존 instagram_post_scraper.js 로직을 여기서 호출
        return {
          post_url: postUrl,
          platform: 'instagram',
          post_type: postUrl.includes('/reel/') ? 'reel' : postUrl.includes('/tv/') ? 'tv' : 'p',
          content: "더미 게시물 내용",
          hashtags: ["#더미", "#태그"],
          mentions: ["@더미유저"],
          tagged_users: [],
          location: "",
          like_count: 0,
          comment_count: 0,
          upload_date: new Date().toISOString(),
          media_type: "image",
          thumbnail_url: ""
        };
      } else if (postUrl.includes('tiktok.com')) {
        // 틱톡 게시물 스크래핑
        return await this.scrapeTikTokPost(postUrl);
      } else {
        console.error(`지원하지 않는 플랫폼: ${postUrl}`);
        return null;
      }
    } catch (error) {
      console.error('단일 게시물 스크래핑 오류:', error.message);
      return null;
    }
  }

  /**
   * 틱톡 게시물 스크래핑
   * @param {string} postUrl - 틱톡 게시물 URL
   * @returns {Object} 틱톡 게시물 데이터
   */
  async scrapeTikTokPost(postUrl) {
    try {
      // 틱톡 스크래퍼 초기화 (필요시)
      if (!this.tiktokPostScraper) {
        this.tiktokPostScraper = new tiktokPostScraper();
        await this.tiktokPostScraper.initialize();
      }

      const postData = await this.tiktokPostScraper.scrapePost(postUrl);
      
      if (postData) {
        // 데이터 구조 통일
        return {
          post_url: postData.post_url,
          platform: 'tiktok',
          post_type: 'video',
          content: postData.content,
          hashtags: postData.hashtags,
          mentions: postData.mentions,
          tagged_users: [],
          location: "",
          like_count: postData.like_count,
          comment_count: postData.comment_count,
          share_count: postData.share_count,
          view_count: postData.view_count,
          upload_date: postData.upload_date,
          media_type: "video",
          thumbnail_url: postData.thumbnail_url,
          video_duration: postData.video_duration,
          music_title: postData.music_title,
          music_artist: postData.music_artist
        };
      }
      
      return null;
    } catch (error) {
      console.error('틱톡 게시물 스크래핑 오류:', error.message);
      return null;
    }
  }

  /**
   * 틱톡 프로필 스크래핑
   * @param {string} username - 틱톡 사용자명
   * @returns {Object} 틱톡 프로필 데이터
   */
  async scrapeTikTokProfile(username) {
    try {
      // 틱톡 프로필 스크래퍼 초기화 (필요시)
      if (!this.tiktokProfileScraper) {
        this.tiktokProfileScraper = new tiktokProfileScraper();
        await this.tiktokProfileScraper.initialize();
      }

      const profileData = await this.tiktokProfileScraper.scrapeProfile(username);
      
      if (profileData) {
        // 데이터 구조 통일
        return {
          api_influencer_id: username,
          platform: 'tiktok',
          username: profileData.username,
          display_name: profileData.display_name,
          bio: profileData.bio,
          followers_count: profileData.followers_count,
          following_count: profileData.following_count,
          likes_count: profileData.likes_count,
          video_count: profileData.video_count,
          profile_image_url: profileData.profile_image_url,
          is_verified: profileData.is_verified,
          is_private: profileData.is_private,
          post_urls: profileData.post_urls
        };
      }
      
      return null;
    } catch (error) {
      console.error('틱톡 프로필 스크래핑 오류:', error.message);
      return null;
    }
  }

  /**
   * 전체 인플루언서 큐 처리
   */
  async processAllInfluencers() {
    if (this.isProcessing) {
      console.log('이미 처리 중입니다.');
      return;
    }

    this.isProcessing = true;
    console.log(`총 ${this.influencerQueue.length}개의 인플루언서를 처리합니다.`);

    const results = [];
    
    while (this.influencerQueue.length > 0) {
      const result = await this.processNextInfluencer();
      if (result) {
        results.push(result);
      }
      
      // 인플루언서 간 딜레이
      await this.delay(2000);
    }

    this.isProcessing = false;
    console.log(`\n=== 스크래핑 완료 ===`);
    console.log(`처리된 인플루언서: ${results.length}개`);
    
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
      isProcessing: this.isProcessing
    };
  }

  /**
   * 리소스 정리
   */
  async cleanup() {
    try {
      if (this.tiktokProfileScraper) {
        await this.tiktokProfileScraper.close();
      }
      if (this.tiktokPostScraper) {
        await this.tiktokPostScraper.close();
      }
      console.log('✓ 인플루언서 스크래퍼 리소스 정리 완료');
    } catch (error) {
      console.error('리소스 정리 오류:', error.message);
    }
  }
}

module.exports = InfluencerScraper; 