const { Pool } = require('pg');

/**
 * PostgreSQL 데이터베이스 서비스
 */
class DatabaseService {
  constructor(dbConfig) {
    this.config = dbConfig;
    this.pool = null;
  }

  /**
   * 데이터베이스 연결
   */
  async connect() {
    try {
      // 환경에 따라 적절한 설정 선택
      const config = process.env.NODE_ENV === 'production' 
        ? this.config.aws.rds 
        : this.config.postgres;
      
      this.pool = new Pool(config);
      
      // 연결 테스트
      const client = await this.pool.connect();
      console.log('✓ PostgreSQL 데이터베이스 연결 성공');
      client.release();
      
      // 테이블 생성
      await this.createTables();
      
    } catch (error) {
      console.error('데이터베이스 연결 실패:', error.message);
      throw error;
    }
  }

  /**
   * 테이블 생성
   */
  async createTables() {
    const createTablesSQL = `
      -- 인플루언서 프로필 테이블
      CREATE TABLE IF NOT EXISTS instagram_profiles (
        id SERIAL PRIMARY KEY,
        api_influencer_id VARCHAR(255) UNIQUE NOT NULL,
        platform VARCHAR(50) DEFAULT 'instagram',
        username VARCHAR(255),
        display_name VARCHAR(255),
        bio TEXT,
        followers_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        posts_count INTEGER DEFAULT 0,
        profile_image_url TEXT,
        is_verified BOOLEAN DEFAULT FALSE,
        is_private BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 인스타그램 게시물 테이블
      CREATE TABLE IF NOT EXISTS instagram_posts (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER REFERENCES instagram_profiles(id),
        post_url TEXT UNIQUE NOT NULL,
        post_type VARCHAR(50),
        content TEXT,
        hashtags TEXT[],
        mentions TEXT[],
        tagged_users TEXT[],
        location VARCHAR(255),
        like_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        upload_date TIMESTAMP,
        media_type VARCHAR(50),
        thumbnail_url TEXT,
        image_urls TEXT[],
        video_urls TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 스크래핑 로그 테이블
      CREATE TABLE IF NOT EXISTS scraping_logs (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER REFERENCES instagram_profiles(id),
        status VARCHAR(50),
        message TEXT,
        error_details TEXT,
        scraping_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 인덱스 생성
      CREATE INDEX IF NOT EXISTS idx_profiles_api_id ON instagram_profiles(api_influencer_id);
      CREATE INDEX IF NOT EXISTS idx_posts_profile_id ON instagram_posts(profile_id);
      CREATE INDEX IF NOT EXISTS idx_posts_url ON instagram_posts(post_url);
      CREATE INDEX IF NOT EXISTS idx_logs_profile_id ON scraping_logs(profile_id);
    `;

    try {
      await this.pool.query(createTablesSQL);
      console.log('✓ 데이터베이스 테이블 생성/확인 완료');
    } catch (error) {
      console.error('테이블 생성 오류:', error.message);
      throw error;
    }
  }

  /**
   * 인플루언서 데이터 전체 저장
   * @param {Object} influencerData - 인플루언서 전체 데이터
   * @returns {Promise<Object>} 저장 결과
   */
  async saveInfluencerData(influencerData) {
    try {
      // 1. 프로필 저장
      const profileId = await this.saveProfile(influencerData.profile);
      
      // 2. 게시물들 저장
      const savedPosts = [];
      for (const postData of influencerData.posts) {
        try {
          const postId = await this.savePost(profileId, postData);
          savedPosts.push(postId);
        } catch (error) {
          console.error(`게시물 저장 실패: ${postData.post_url}`, error.message);
        }
      }

      return {
        profileId,
        savedPosts: savedPosts.length,
        totalPosts: influencerData.posts.length
      };

    } catch (error) {
      console.error('인플루언서 데이터 저장 오류:', error.message);
      throw error;
    }
  }

  /**
   * 인플루언서 프로필 저장
   */
  async saveProfile(profileData) {
    const client = await this.pool.connect();
    
    try {
      const insertSQL = `
        INSERT INTO instagram_profiles (
          api_influencer_id, username, display_name, bio, 
          followers_count, following_count, posts_count,
          profile_image_url, is_verified, is_private
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (api_influencer_id) 
        DO UPDATE SET 
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          bio = EXCLUDED.bio,
          followers_count = EXCLUDED.followers_count,
          following_count = EXCLUDED.following_count,
          posts_count = EXCLUDED.posts_count,
          profile_image_url = EXCLUDED.profile_image_url,
          is_verified = EXCLUDED.is_verified,
          is_private = EXCLUDED.is_private,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id;
      `;

      const values = [
        profileData.api_influencer_id,
        profileData.username,
        profileData.display_name,
        profileData.bio,
        profileData.followers_count || 0,
        profileData.following_count || 0,
        profileData.posts_count || 0,
        profileData.profile_image_url,
        profileData.is_verified || false,
        profileData.is_private || false
      ];

      const result = await client.query(insertSQL, values);
      const profileId = result.rows[0].id;
      
      console.log(`프로필 저장 완료: ${profileData.username} (ID: ${profileId})`);
      return profileId;

    } catch (error) {
      console.error('프로필 저장 오류:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 게시물 저장
   */
  async savePost(profileId, postData) {
    const client = await this.pool.connect();
    
    try {
      const insertSQL = `
        INSERT INTO instagram_posts (
          profile_id, post_url, post_type, content,
          hashtags, mentions, tagged_users, location,
          like_count, comment_count, upload_date,
          media_type, thumbnail_url, image_urls, video_urls
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (post_url) 
        DO UPDATE SET 
          content = EXCLUDED.content,
          hashtags = EXCLUDED.hashtags,
          mentions = EXCLUDED.mentions,
          tagged_users = EXCLUDED.tagged_users,
          location = EXCLUDED.location,
          like_count = EXCLUDED.like_count,
          comment_count = EXCLUDED.comment_count,
          media_type = EXCLUDED.media_type,
          thumbnail_url = EXCLUDED.thumbnail_url,
          image_urls = EXCLUDED.image_urls,
          video_urls = EXCLUDED.video_urls
        RETURNING id;
      `;

      const values = [
        profileId,
        postData.post_url,
        postData.post_type,
        postData.content,
        postData.hashtags || [],
        postData.mentions || [],
        postData.tagged_users || [],
        postData.location,
        postData.like_count || 0,
        postData.comment_count || 0,
        postData.upload_date,
        postData.media_type,
        postData.thumbnail_url,
        postData.image_urls || [],
        postData.video_urls || []
      ];

      const result = await client.query(insertSQL, values);
      const postId = result.rows[0].id;
      
      return postId;

    } catch (error) {
      console.error('게시물 저장 오류:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 데이터베이스 상태 확인
   */
  async getStatus() {
    try {
      const client = await this.pool.connect();
      
      // 기본 연결 테스트
      await client.query('SELECT NOW()');
      
      // 테이블 통계
      const profileCount = await client.query('SELECT COUNT(*) FROM instagram_profiles');
      const postCount = await client.query('SELECT COUNT(*) FROM instagram_posts');
      
      client.release();
      
      return {
        connected: true,
        profiles: parseInt(profileCount.rows[0].count),
        posts: parseInt(postCount.rows[0].count),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 연결 종료
   */
  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      console.log('✓ 데이터베이스 연결 종료');
    }
  }
}

module.exports = DatabaseService; 