const { Pool } = require('pg');

/**
 * PostgreSQL 데이터베이스 서비스 (TikTok 전용)
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
      const config = process.env.NODE_ENV === 'production' 
        ? this.config.aws.rds 
        : this.config.postgres;
      
      this.pool = new Pool(config);
      
      const client = await this.pool.connect();
      console.log('✓ TikTok PostgreSQL 데이터베이스 연결 성공');
      client.release();
      
      await this.createTables();
      
    } catch (error) {
      console.error('TikTok 데이터베이스 연결 실패:', error.message);
      throw error;
    }
  }

  /**
   * 테이블 생성
   */
  async createTables() {
    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS tiktok_profiles (
        id SERIAL PRIMARY KEY,
        api_influencer_id VARCHAR(255) UNIQUE NOT NULL,
        platform VARCHAR(50) DEFAULT 'tiktok',
        username VARCHAR(255),
        display_name VARCHAR(255),
        bio TEXT,
        followers_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        likes_count BIGINT DEFAULT 0,
        video_count INTEGER DEFAULT 0,
        profile_image_url TEXT,
        is_verified BOOLEAN DEFAULT FALSE,
        is_private BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tiktok_posts (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER REFERENCES tiktok_profiles(id),
        post_url TEXT UNIQUE NOT NULL,
        post_id VARCHAR(255),
        content TEXT,
        hashtags TEXT[],
        mentions TEXT[],
        like_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        share_count INTEGER DEFAULT 0,
        view_count BIGINT DEFAULT 0,
        upload_date TIMESTAMP,
        video_duration INTEGER,
        thumbnail_url TEXT,
        video_url TEXT,
        music_title VARCHAR(255),
        music_artist VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_tiktok_profiles_api_id ON tiktok_profiles(api_influencer_id);
      CREATE INDEX IF NOT EXISTS idx_tiktok_posts_profile_id ON tiktok_posts(profile_id);
    `;

    try {
      await this.pool.query(createTablesSQL);
      console.log('✓ TikTok 데이터베이스 테이블 생성/확인 완료');
    } catch (error) {
      console.error('TikTok 테이블 생성 오류:', error.message);
      throw error;
    }
  }

  /**
   * TikTok 인플루언서 데이터 저장
   */
  async saveInfluencerData(influencerData) {
    try {
      const profileId = await this.saveProfile(influencerData.profile);
      
      const savedPosts = [];
      for (const postData of influencerData.posts) {
        try {
          const postId = await this.savePost(profileId, postData);
          savedPosts.push(postId);
        } catch (error) {
          console.error(`TikTok 게시물 저장 실패: ${postData.post_url}`, error.message);
        }
      }

      return {
        profileId,
        savedPosts: savedPosts.length,
        totalPosts: influencerData.posts.length
      };

    } catch (error) {
      console.error('TikTok 인플루언서 데이터 저장 오류:', error.message);
      throw error;
    }
  }

  /**
   * TikTok 프로필 저장
   */
  async saveProfile(profileData) {
    const client = await this.pool.connect();
    
    try {
      const insertSQL = `
        INSERT INTO tiktok_profiles (
          api_influencer_id, username, display_name, bio, 
          followers_count, following_count, likes_count, video_count,
          profile_image_url, is_verified, is_private
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (api_influencer_id) 
        DO UPDATE SET 
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          bio = EXCLUDED.bio,
          followers_count = EXCLUDED.followers_count,
          following_count = EXCLUDED.following_count,
          likes_count = EXCLUDED.likes_count,
          video_count = EXCLUDED.video_count,
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
        profileData.likes_count || 0,
        profileData.video_count || 0,
        profileData.profile_image_url,
        profileData.is_verified || false,
        profileData.is_private || false
      ];

      const result = await client.query(insertSQL, values);
      return result.rows[0].id;

    } finally {
      client.release();
    }
  }

  /**
   * TikTok 게시물 저장
   */
  async savePost(profileId, postData) {
    const client = await this.pool.connect();
    
    try {
      const insertSQL = `
        INSERT INTO tiktok_posts (
          profile_id, post_url, post_id, content,
          hashtags, mentions, like_count, comment_count,
          share_count, view_count, upload_date, video_duration,
          thumbnail_url, video_url, music_title, music_artist
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (post_url) 
        DO UPDATE SET 
          content = EXCLUDED.content,
          hashtags = EXCLUDED.hashtags,
          mentions = EXCLUDED.mentions,
          like_count = EXCLUDED.like_count,
          comment_count = EXCLUDED.comment_count,
          share_count = EXCLUDED.share_count,
          view_count = EXCLUDED.view_count
        RETURNING id;
      `;

      const values = [
        profileId,
        postData.post_url,
        postData.post_id,
        postData.content,
        postData.hashtags || [],
        postData.mentions || [],
        postData.like_count || 0,
        postData.comment_count || 0,
        postData.share_count || 0,
        postData.view_count || 0,
        postData.upload_date,
        postData.video_duration,
        postData.thumbnail_url,
        postData.video_url,
        postData.music_title,
        postData.music_artist
      ];

      const result = await client.query(insertSQL, values);
      return result.rows[0].id;

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
      
      await client.query('SELECT NOW()');
      
      const profileCount = await client.query('SELECT COUNT(*) FROM tiktok_profiles');
      const postCount = await client.query('SELECT COUNT(*) FROM tiktok_posts');
      
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
      console.log('✓ TikTok 데이터베이스 연결 종료');
    }
  }
}

module.exports = DatabaseService; 