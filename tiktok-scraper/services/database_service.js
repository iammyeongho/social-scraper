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
   * 테이블 생성 - 통합 스키마와 완전 일치
   */
  async createTables() {
    const createTablesSQL = `
      -- ==============================================
      -- 1. TikTok 인플루언서 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS tiktok_influencer (
          id BIGSERIAL PRIMARY KEY,
          tiktok_id VARCHAR(255) UNIQUE NOT NULL,
          tiktok_name VARCHAR(255),
          profile_url VARCHAR(500),
          description TEXT,
          is_verified BOOLEAN DEFAULT FALSE,
          is_private BOOLEAN DEFAULT FALSE,
          following BIGINT DEFAULT 0,
          followers BIGINT DEFAULT 0,
          engage_rate DECIMAL(5,2),
          hearts BIGINT DEFAULT 0,
          avg_heart DECIMAL(10,2),
          avg_comments DECIMAL(10,2),
          avg_shares DECIMAL(10,2),
          avg_plays DECIMAL(15,2),
          videos INTEGER DEFAULT 0,
          avg_length DECIMAL(8,2),
          category VARCHAR(100),
          country VARCHAR(100),
          lang VARCHAR(10),
          last_post_dt TIMESTAMP,
          g_rate_followers DECIMAL(5,2),
          g_rate_engage_rate DECIMAL(5,2),
          active_user_type VARCHAR(50),
          profile_image_url VARCHAR(500),
          external_url VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- ==============================================
      -- 2. TikTok 게시물 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS tiktok_post (
          id BIGSERIAL PRIMARY KEY,
          influencer_id BIGINT NOT NULL,
          post_id VARCHAR(255) UNIQUE,
          post_url VARCHAR(500),
          length INTEGER,
          cover VARCHAR(500),
          hearts BIGINT DEFAULT 0,
          shares BIGINT DEFAULT 0,
          comments BIGINT DEFAULT 0,
          plays BIGINT DEFAULT 0,
          hashtags TEXT,
          commerce_hashtags TEXT,
          is_ad BOOLEAN DEFAULT FALSE,
          content TEXT,
          video_url VARCHAR(500),
          music_title VARCHAR(255),
          music_artist VARCHAR(255),
          effects_used TEXT,
          upload_date TIMESTAMP,
          scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          raw_data JSONB,
          FOREIGN KEY (influencer_id) REFERENCES tiktok_influencer(id) ON DELETE CASCADE
      );

      -- ==============================================
      -- 3. TikTok 댓글 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS tiktok_comments (
          id BIGSERIAL PRIMARY KEY,
          post_id BIGINT NOT NULL,
          comment_id VARCHAR(255) UNIQUE,
          parent_comment_id BIGINT,
          user_name VARCHAR(255),
          display_name VARCHAR(255),
          FOREIGN KEY (post_id) REFERENCES tiktok_post(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_comment_id) REFERENCES tiktok_comments(id) ON DELETE SET NULL
      );

      -- ==============================================
      -- 4. TikTok 팔로워 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS tiktok_followers (
          id BIGSERIAL PRIMARY KEY,
          influencer_id BIGINT NOT NULL,
          follower_username VARCHAR(255) NOT NULL,
          follower_display_name VARCHAR(255),
          follower_avatar_url VARCHAR(500),
          follower_profile_url VARCHAR(500),
          is_verified BOOLEAN DEFAULT FALSE,
          follower_count BIGINT DEFAULT 0,
          following_count BIGINT DEFAULT 0,
          follow_status VARCHAR(50) DEFAULT 'following',
          discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT TRUE,
          scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          raw_data JSONB,
          FOREIGN KEY (influencer_id) REFERENCES tiktok_influencer(id) ON DELETE CASCADE,
          UNIQUE(influencer_id, follower_username)
      );

      -- ==============================================
      -- 5. TikTok 팔로워 통계 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS tiktok_follower_stats (
          id BIGSERIAL PRIMARY KEY,
          influencer_id BIGINT NOT NULL,
          total_followers_scraped INTEGER DEFAULT 0,
          verified_followers INTEGER DEFAULT 0,
          mutual_followers INTEGER DEFAULT 0,
          avg_follower_count DECIMAL(15,2),
          max_follower_count BIGINT DEFAULT 0,
          scraping_started_at TIMESTAMP,
          scraping_completed_at TIMESTAMP,
          scraping_duration_seconds INTEGER,
          last_scrape_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          scrape_status VARCHAR(50) DEFAULT 'pending',
          estimated_total INTEGER DEFAULT 0,
          scrape_percentage DECIMAL(5,2) DEFAULT 0,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (influencer_id) REFERENCES tiktok_influencer(id) ON DELETE CASCADE,
          UNIQUE(influencer_id)
      );

      -- ==============================================
      -- 6. TikTok 해시태그 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS tiktok_hashtags (
          id BIGSERIAL PRIMARY KEY,
          hashtag VARCHAR(255) UNIQUE NOT NULL,
          total_posts BIGINT DEFAULT 0,
          avg_hearts DECIMAL(15,2),
          avg_views DECIMAL(15,2),
          trending_score DECIMAL(8,2),
          first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- ==============================================
      -- 7. 게시물-해시태그 관계 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS post_hashtags (
          id BIGSERIAL PRIMARY KEY,
          post_id BIGINT NOT NULL,
          hashtag_id BIGINT NOT NULL,
          position_in_post INTEGER,
          FOREIGN KEY (post_id) REFERENCES tiktok_post(id) ON DELETE CASCADE,
          FOREIGN KEY (hashtag_id) REFERENCES tiktok_hashtags(id) ON DELETE CASCADE,
          UNIQUE(post_id, hashtag_id)
      );

      -- ==============================================
      -- 8. 스크래핑 성능 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS tiktok_scraping_performance (
          id BIGSERIAL PRIMARY KEY,
          session_id VARCHAR(255),
          task_type VARCHAR(50) NOT NULL,
          target_id VARCHAR(255),
          target_name VARCHAR(255),
          start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          end_time TIMESTAMP,
          duration_seconds INTEGER,
          items_collected INTEGER DEFAULT 0,
          items_target INTEGER DEFAULT 0,
          success_rate DECIMAL(5,2),
          avg_speed_items_per_second DECIMAL(8,4),
          memory_usage_mb INTEGER,
          cpu_usage_percent DECIMAL(5,2),
          error_count INTEGER DEFAULT 0,
          status VARCHAR(50) DEFAULT 'running',
          notes TEXT,
          raw_metrics JSONB
      );

      -- ==============================================
      -- 9. 스크래핑 세션 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS tiktok_scraping_sessions (
          id BIGSERIAL PRIMARY KEY,
          session_id VARCHAR(255) UNIQUE,
          session_name VARCHAR(255),
          total_tasks INTEGER DEFAULT 0,
          completed_tasks INTEGER DEFAULT 0,
          failed_tasks INTEGER DEFAULT 0,
          total_items_collected INTEGER DEFAULT 0,
          session_start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          session_end_time TIMESTAMP,
          total_duration_seconds INTEGER,
          avg_task_duration DECIMAL(10,2),
          overall_success_rate DECIMAL(5,2),
          status VARCHAR(50) DEFAULT 'active',
          config_snapshot JSONB
      );

      -- ==============================================
      -- 10. 스크래핑 설정 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS tiktok_scraping_config (
          id BIGSERIAL PRIMARY KEY,
          config_key VARCHAR(100) UNIQUE NOT NULL,
          config_value TEXT,
          config_type VARCHAR(50),
          description TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- ==============================================
      -- 11. 스크래핑 로그 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS scraping_logs (
          id BIGSERIAL PRIMARY KEY,
          task_type VARCHAR(50) NOT NULL,
          target_type VARCHAR(50) NOT NULL,
          target_id VARCHAR(255),
          status VARCHAR(50) NOT NULL,
          total_items INTEGER DEFAULT 0,
          processed_items INTEGER DEFAULT 0,
          success_items INTEGER DEFAULT 0,
          failed_items INTEGER DEFAULT 0,
          start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          end_time TIMESTAMP,
          duration_seconds INTEGER,
          last_checkpoint VARCHAR(255),
          notes TEXT,
          raw_config JSONB
      );

      -- ==============================================
      -- 12. 에러 로그 테이블
      -- ==============================================
      CREATE TABLE IF NOT EXISTS error_logs (
          id BIGSERIAL PRIMARY KEY,
          scraping_log_id BIGINT,
          error_type VARCHAR(100),
          error_code VARCHAR(50),
          error_message TEXT,
          error_details JSONB,
          target_url VARCHAR(500),
          retry_count INTEGER DEFAULT 0,
          is_resolved BOOLEAN DEFAULT FALSE,
          occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (scraping_log_id) REFERENCES scraping_logs(id) ON DELETE SET NULL
      );

      -- ==============================================
      -- 인덱스 생성 (성능 최적화)
      -- ==============================================

      -- 인플루언서 인덱스
      CREATE INDEX IF NOT EXISTS idx_tiktok_influencer_tiktok_id ON tiktok_influencer(tiktok_id);
      CREATE INDEX IF NOT EXISTS idx_tiktok_influencer_followers ON tiktok_influencer(followers DESC);
      CREATE INDEX IF NOT EXISTS idx_tiktok_influencer_category ON tiktok_influencer(category);
      CREATE INDEX IF NOT EXISTS idx_tiktok_influencer_updated_at ON tiktok_influencer(updated_at DESC);

      -- 게시물 인덱스
      CREATE INDEX IF NOT EXISTS idx_tiktok_post_influencer_id ON tiktok_post(influencer_id);
      CREATE INDEX IF NOT EXISTS idx_tiktok_post_hearts ON tiktok_post(hearts DESC);
      CREATE INDEX IF NOT EXISTS idx_tiktok_post_upload_date ON tiktok_post(upload_date DESC);
      CREATE INDEX IF NOT EXISTS idx_tiktok_post_scraped_at ON tiktok_post(scraped_at DESC);

      -- 댓글 인덱스
      CREATE INDEX IF NOT EXISTS idx_tiktok_comments_post_id ON tiktok_comments(post_id);
      CREATE INDEX IF NOT EXISTS idx_tiktok_comments_user ON tiktok_comments(user_name);
      -- 팔로워 인덱스
      CREATE INDEX IF NOT EXISTS idx_tiktok_followers_influencer_id ON tiktok_followers(influencer_id);
      CREATE INDEX IF NOT EXISTS idx_tiktok_followers_username ON tiktok_followers(follower_username);
      CREATE INDEX IF NOT EXISTS idx_tiktok_followers_scraped_at ON tiktok_followers(scraped_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tiktok_follower_stats_influencer_id ON tiktok_follower_stats(influencer_id);

      -- 해시태그 인덱스
      CREATE INDEX IF NOT EXISTS idx_tiktok_hashtags_trending ON tiktok_hashtags(trending_score DESC);
      CREATE INDEX IF NOT EXISTS idx_post_hashtags_post_id ON post_hashtags(post_id);
      CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag_id ON post_hashtags(hashtag_id);

      -- 성능 추적 인덱스
      CREATE INDEX IF NOT EXISTS idx_scraping_performance_session_id ON tiktok_scraping_performance(session_id);
      CREATE INDEX IF NOT EXISTS idx_scraping_performance_task_type ON tiktok_scraping_performance(task_type);
      CREATE INDEX IF NOT EXISTS idx_scraping_performance_start_time ON tiktok_scraping_performance(start_time DESC);
      CREATE INDEX IF NOT EXISTS idx_scraping_sessions_status ON tiktok_scraping_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_scraping_config_key ON tiktok_scraping_config(config_key);

      -- 로그 인덱스
      CREATE INDEX IF NOT EXISTS idx_scraping_logs_status ON scraping_logs(status);
      CREATE INDEX IF NOT EXISTS idx_scraping_logs_start_time ON scraping_logs(start_time DESC);
      CREATE INDEX IF NOT EXISTS idx_scraping_logs_task_type ON scraping_logs(task_type);
      CREATE INDEX IF NOT EXISTS idx_error_logs_occurred_at ON error_logs(occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);

      -- ==============================================
      -- 기본 설정 데이터 삽입
      -- ==============================================
      INSERT INTO tiktok_scraping_config (config_key, config_value, config_type, description) VALUES
      ('max_followers_per_influencer', '1000', 'integer', 'Maximum followers to scrape per influencer'),
      ('max_comments_per_post', '500', 'integer', 'Maximum comments to scrape per post'),
      ('max_posts_per_influencer', '50', 'integer', 'Maximum posts to scrape per influencer'),
      ('scraping_delay_ms', '2000', 'integer', 'Delay between requests in milliseconds'),
      ('max_retry_attempts', '3', 'integer', 'Maximum retry attempts for failed requests'),
      ('enable_performance_tracking', 'true', 'boolean', 'Enable detailed performance tracking')
      ON CONFLICT (config_key) DO NOTHING;
    `;

    try {
      await this.pool.query(createTablesSQL);
      console.log('✓ TikTok 데이터베이스 테이블 생성/확인 완료 (통합 스키마 적용)');
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
      console.log(`🔄 프로필 저장 시작: @${influencerData.profile.username}`);
      const profileId = await this.saveProfile(influencerData.profile);
      console.log(`✅ 프로필 저장 완료: profileId=${profileId}`);
      
      console.log(`🔄 게시물 저장 시작: ${influencerData.posts.length}개`);
      const savedPosts = [];
      for (const postData of influencerData.posts) {
        try {
          const postId = await this.savePost(profileId, postData);
          savedPosts.push(postId);
          console.log(`  ✅ 게시물 저장: ${postData.post_url}`);
        } catch (error) {
          console.error(`  ❌ 게시물 저장 실패: ${postData.post_url}`, error.message);
        }
      }
      console.log(`✅ 게시물 저장 완료: ${savedPosts.length}/${influencerData.posts.length}개`);

      return {
        profileId,
        savedPosts: savedPosts.length,
        totalPosts: influencerData.posts.length
      };

    } catch (error) {
      console.error('💥 TikTok 인플루언서 데이터 저장 오류:', error.message);
      console.error('스택 트레이스:', error.stack);
      throw error;
    }
  }

  /**
   * TikTok 프로필 저장 - 통합 스키마 완전 호환
   */
  async saveProfile(profileData) {
    console.log(`📝 프로필 저장 상세: ${JSON.stringify({
      username: profileData.username,
      display_name: profileData.display_name,
      followers_count: profileData.followers_count,
      following_count: profileData.following_count,
      video_count: profileData.video_count
    }, null, 2)}`);
    
    const client = await this.pool.connect();
    
    try {
      const insertSQL = `
        INSERT INTO tiktok_influencer (
          tiktok_id, tiktok_name, profile_url, description, is_verified, is_private,
          following, followers, engage_rate, hearts, avg_heart, avg_comments,
          avg_shares, avg_plays, videos, avg_length, category, country, lang,
          last_post_dt, g_rate_followers, g_rate_engage_rate, active_user_type,
          profile_image_url, external_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
        ON CONFLICT (tiktok_id) 
        DO UPDATE SET 
          tiktok_name = EXCLUDED.tiktok_name,
          profile_url = EXCLUDED.profile_url,
          description = EXCLUDED.description,
          is_verified = EXCLUDED.is_verified,
          is_private = EXCLUDED.is_private,
          following = EXCLUDED.following,
          followers = EXCLUDED.followers,
          engage_rate = EXCLUDED.engage_rate,
          hearts = EXCLUDED.hearts,
          avg_heart = EXCLUDED.avg_heart,
          avg_comments = EXCLUDED.avg_comments,
          avg_shares = EXCLUDED.avg_shares,
          avg_plays = EXCLUDED.avg_plays,
          videos = EXCLUDED.videos,
          avg_length = EXCLUDED.avg_length,
          category = EXCLUDED.category,
          country = EXCLUDED.country,
          lang = EXCLUDED.lang,
          last_post_dt = EXCLUDED.last_post_dt,
          g_rate_followers = EXCLUDED.g_rate_followers,
          g_rate_engage_rate = EXCLUDED.g_rate_engage_rate,
          active_user_type = EXCLUDED.active_user_type,
          profile_image_url = EXCLUDED.profile_image_url,
          external_url = EXCLUDED.external_url,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id;
      `;

      const username = profileData.username || profileData.tiktok_id;
      const totalViews = profileData.total_views_from_posts || 0;
      const postCount = profileData.post_data ? profileData.post_data.length : (profileData.video_count || 0);

      const values = [
        username,
        profileData.display_name || profileData.tiktok_name,
        `https://www.tiktok.com/@${username}`,
        profileData.bio || profileData.description,
        profileData.is_verified || false,
        profileData.is_private || false,
        profileData.following_count || profileData.following || 0,
        profileData.followers_count || profileData.followers || 0,
        null, // engage_rate - 추후 계산
        profileData.likes_count || profileData.hearts || 0,
        postCount > 0 ? Math.round((profileData.likes_count || 0) / postCount) : null, // avg_heart
        null, // avg_comments - 추후 계산
        null, // avg_shares - 추후 계산
        postCount > 0 ? Math.round(totalViews / postCount) : null, // avg_plays
        profileData.video_count || profileData.videos || 0,
        null, // avg_length - 추후 계산
        null, // category - 추후 분류
        null, // country - 추후 감지
        'ko', // lang - 기본값 한국어
        null, // last_post_dt - 추후 업데이트
        null, // g_rate_followers - 추후 계산
        null, // g_rate_engage_rate - 추후 계산
        'creator', // active_user_type - 기본값
        profileData.profile_image_url,
        profileData.external_url || null
      ];

      const result = await client.query(insertSQL, values);
      return result.rows[0].id;

    } finally {
      client.release();
    }
  }

  /**
   * URL 정규화 함수 - TikTok URL의 다양한 형태를 표준화
   */
  normalizeUrl(url) {
    if (!url) return url;
    
    try {
      // 쿼리 파라미터 제거
      let normalized = url.split('?')[0];
      
      // www 통일 (기존 DB 데이터가 www 포함이므로 www 추가)
      if (normalized.includes('https://tiktok.com/') && !normalized.includes('https://www.tiktok.com/')) {
        normalized = normalized.replace('https://tiktok.com', 'https://www.tiktok.com');
      }
      
      // 끝의 슬래시 제거
      normalized = normalized.replace(/\/$/, '');
      
      return normalized;
    } catch (error) {
      console.error('URL 정규화 오류:', error.message);
      return url;
    }
  }

  /**
   * URL로 게시물 찾기 (스트림 처리용)
   * @param {string} postUrl - 찾을 게시물 URL
   * @param {number} profileId - 프로필 ID
   * @returns {Object|null} 찾은 게시물 또는 null
   */
  async findPostByUrl(postUrl, profileId) {
    const client = await this.pool.connect();
    
    try {
      // URL 정규화
      const normalizedUrl = this.normalizeUrl(postUrl);
      const postId = this.extractPostIdFromUrl(normalizedUrl);
      
      console.log(`🔍 게시물 검색: profileId=${profileId}, url=${normalizedUrl}, postId=${postId}`);
      
      // 1차: 정확한 URL 매칭
      let query = `
        SELECT id, post_url, post_id 
        FROM tiktok_post 
        WHERE influencer_id = $1 AND post_url = $2
        LIMIT 1
      `;
      let result = await client.query(query, [profileId, normalizedUrl]);
      
      if (result.rows.length > 0) {
        console.log(`✅ 정확한 URL로 게시물 발견: ${result.rows[0].id}`);
        return result.rows[0];
      }
      
      // 2차: post_id로 매칭
      if (postId) {
        query = `
          SELECT id, post_url, post_id 
          FROM tiktok_post 
          WHERE influencer_id = $1 AND post_id = $2
          LIMIT 1
        `;
        result = await client.query(query, [profileId, postId]);
        
        if (result.rows.length > 0) {
          console.log(`✅ post_id로 게시물 발견: ${result.rows[0].id}`);
          return result.rows[0];
        }
      }
      
      // 3차: 유사한 URL로 검색 (post_id 포함)
      if (postId) {
        query = `
          SELECT id, post_url, post_id 
          FROM tiktok_post 
          WHERE influencer_id = $1 AND post_url LIKE $2
          LIMIT 1
        `;
        result = await client.query(query, [profileId, `%${postId}%`]);
        
        if (result.rows.length > 0) {
          console.log(`✅ 유사한 URL로 게시물 발견: ${result.rows[0].id}`);
          return result.rows[0];
        }
      }
      
      console.log(`❌ 게시물을 찾을 수 없음: ${normalizedUrl}`);
      return null;
      
    } catch (error) {
      console.error('게시물 검색 오류:', error.message);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * 게시물 저장 - 통합 스키마 완전 호환
   */
  async savePost(profileId, postData) {
    const client = await this.pool.connect();
    try {
      // 3개월 초과 게시물은 저장하지 않고, 기존에 있으면 삭제
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      if (postData.upload_date && new Date(postData.upload_date) < threeMonthsAgo) {
        const postId = postData.post_id || this.extractPostIdFromUrl(postData.post_url);
        if (postId) {
          await client.query(
            'DELETE FROM tiktok_post WHERE influencer_id = $1 AND post_id = $2',
            [profileId, postId]
          );
          console.log(`🗑️ 3개월 초과 게시물 삭제: influencer_id=${profileId}, post_id=${postId}`);
        }
        return null;
      }
      
      console.log(`📝 게시물 저장: ${postData.post_url}`);
      
      // URL 정규화
      const originalUrl = postData.post_url;
      const normalizedUrl = this.normalizeUrl(originalUrl);
      
      if (originalUrl !== normalizedUrl) {
        console.log(`🔄 URL 정규화: ${originalUrl} -> ${normalizedUrl}`);
      }

      const insertSQL = `
        INSERT INTO tiktok_post (
          influencer_id, post_id, post_url, length, cover, hearts, shares, comments, plays,
          hashtags, commerce_hashtags, is_ad, content, video_url, music_title, music_artist,
          effects_used, upload_date, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (post_id) 
        DO UPDATE SET 
          post_url = EXCLUDED.post_url,
          hearts = EXCLUDED.hearts,
          comments = EXCLUDED.comments,
          shares = EXCLUDED.shares,
          plays = GREATEST(tiktok_post.plays, EXCLUDED.plays),
          content = EXCLUDED.content,
          hashtags = EXCLUDED.hashtags,
          music_title = EXCLUDED.music_title,
          music_artist = EXCLUDED.music_artist,
          effects_used = EXCLUDED.effects_used,
          upload_date = EXCLUDED.upload_date,
          raw_data = EXCLUDED.raw_data
        RETURNING id;
      `;

      const values = [
        profileId,
        postData.post_id || this.extractPostIdFromUrl(normalizedUrl),
        normalizedUrl, // 정규화된 URL 사용
        postData.length || postData.video_duration || 0,
        postData.cover || postData.thumbnail_url || '',
        postData.hearts || postData.like_count || 0,
        postData.shares || postData.share_count || 0,
        postData.comments || postData.comment_count || 0,
        postData.plays || postData.view_count || postData.viewCount || 0,
        Array.isArray(postData.hashtags) ? postData.hashtags.join(',') : (postData.hashtags || ''),
        postData.commerce_hashtags || '',
        postData.is_ad || false,
        postData.content || '',
        postData.video_url || '',
        postData.music_title || '',
        postData.music_artist || '',
        postData.effects_used || '',
        postData.upload_date !== undefined ? postData.upload_date : null,
        JSON.stringify(postData) // raw_data로 원본 데이터 저장
      ];

      const result = await client.query(insertSQL, values);
      return result.rows[0].id;

    } finally {
      client.release();
    }
  }

  /**
   * URL에서 post_id 추출
   */
  extractPostIdFromUrl(url) {
    try {
      const match = url.match(/\/video\/(\d+)/);
      return match ? match[1] : null;
    } catch (error) {
      console.error('URL에서 post_id 추출 오류:', error.message);
      return null;
    }
  }

  /**
   * TikTok 팔로워 데이터 저장
   */
  async saveFollowersData(profileId, followersData) {
    try {
      console.log(`💾 ${followersData.followers.length}명의 팔로워 데이터 저장 중...`);
      
      let savedCount = 0;
      const verifiedCount = followersData.followers.filter(f => f.is_verified).length;
      
      // 팔로워 개별 저장
      for (const follower of followersData.followers) {
        try {
          await this.saveFollower(profileId, follower);
          savedCount++;
        } catch (error) {
          console.error(`팔로워 저장 실패 (@${follower.username}):`, error.message);
        }
      }
      
      // 팔로워 통계 저장/업데이트
      await this.saveFollowerStats(profileId, {
        total_followers_scraped: savedCount,
        verified_followers: verifiedCount,
        estimated_total: followersData.target_limit || savedCount,
        scrape_percentage: followersData.collection_rate || 100,
        scrape_status: 'completed'
      });
      
      console.log(`✅ 팔로워 데이터 저장 완료: ${savedCount}명 저장, ${verifiedCount}명 인증됨`);
      return savedCount;
      
    } catch (error) {
      console.error('팔로워 데이터 저장 오류:', error.message);
      throw error;
    }
  }

  /**
   * 개별 팔로워 저장
   */
  async saveFollower(profileId, followerData) {
    const client = await this.pool.connect();
    
    try {
      const insertSQL = `
        INSERT INTO tiktok_followers (
          influencer_id, follower_username, follower_display_name,
          follower_avatar_url, follower_profile_url, is_verified,
          follow_status, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (influencer_id, follower_username) 
        DO UPDATE SET 
          follower_display_name = EXCLUDED.follower_display_name,
          follower_avatar_url = EXCLUDED.follower_avatar_url,
          is_verified = EXCLUDED.is_verified,
          last_checked_at = CURRENT_TIMESTAMP
        RETURNING id;
      `;

      const values = [
        profileId,
        followerData.username,
        followerData.display_name || '',
        followerData.avatar_url || '',
        followerData.profile_url || `https://www.tiktok.com/@${followerData.username}`,
        followerData.is_verified || false,
        followerData.follow_status || 'following',
        JSON.stringify(followerData)
      ];

      const result = await client.query(insertSQL, values);
      return result.rows[0].id;

    } finally {
      client.release();
    }
  }

  /**
   * 팔로워 통계 저장
   */
  async saveFollowerStats(profileId, statsData) {
    const client = await this.pool.connect();
    
    try {
      const insertSQL = `
        INSERT INTO tiktok_follower_stats (
          influencer_id, total_followers_scraped, verified_followers,
          estimated_total, scrape_percentage, scrape_status
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (influencer_id) 
        DO UPDATE SET 
          total_followers_scraped = EXCLUDED.total_followers_scraped,
          verified_followers = EXCLUDED.verified_followers,
          estimated_total = EXCLUDED.estimated_total,
          scrape_percentage = EXCLUDED.scrape_percentage,
          scrape_status = EXCLUDED.scrape_status,
          last_scrape_date = CURRENT_TIMESTAMP
        RETURNING id;
      `;

      const values = [
        profileId,
        statsData.total_followers_scraped || 0,
        statsData.verified_followers || 0,
        statsData.estimated_total || 0,
        statsData.scrape_percentage || 0,
        statsData.scrape_status || 'completed'
      ];

      const result = await client.query(insertSQL, values);
      return result.rows[0].id;

    } finally {
      client.release();
    }
  }

  /**
   * TikTok 댓글 데이터 저장 (배치 처리로 성능 최적화)
   */
  async saveCommentsData(profileId, commentsData) {
    try {
      console.log(`💬 댓글 저장 시작: ${commentsData.post_url} (${commentsData.total}개 댓글)`);
      
      // 게시물 ID 찾기
      const postQuery = await this.query(
        'SELECT id FROM tiktok_post WHERE post_url = $1 AND influencer_id = $2',
        [commentsData.post_url, profileId]
      );
      
      if (postQuery.rows.length === 0) {
        console.error(`게시물을 찾을 수 없습니다: ${commentsData.post_url}`);
        return 0;
      }
      
      const postId = postQuery.rows[0].id;
      
      // 배치로 모든 댓글 저장 (성능 최적화)
      const savedCount = await this.saveCommentsBatch(postId, commentsData.allComments || []);
      
      console.log(`✅ 댓글 저장 완료: ${savedCount}개 저장됨`);
      return savedCount;
      
    } catch (error) {
      console.error('댓글 데이터 저장 오류:', error.message);
      throw error;
    }
  }

  /**
   * 배치로 댓글 저장 (성능 최적화)
   * @param {number} postId - 게시물 ID
   * @param {Array} comments - 댓글 배열
   * @returns {number} 저장된 댓글 수
   */
  async saveCommentsBatch(postId, comments) {
    if (!comments || comments.length === 0) return 0;
    
    const client = await this.pool.connect();
    
    try {
      // 댓글 데이터 준비 (중복 제거)
      const uniqueAuthors = new Set();
      const validComments = [];
      
      for (const comment of comments) {
        const userName = comment.author || comment.username || comment.user_name || '';
        if (userName && !uniqueAuthors.has(userName)) {
          uniqueAuthors.add(userName);
          validComments.push({
            comment_id: `${postId}_${userName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            user_name: userName
          });
        }
      }
      
      if (validComments.length === 0) return 0;
      
      // 배치 INSERT (중복은 무시)
      const values = [];
      const placeholders = [];
      const currentTime = new Date();
      
      validComments.forEach((comment, index) => {
        const baseIndex = index * 4;
        placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`);
        values.push(postId, comment.comment_id, comment.user_name, currentTime);
      });
      
      const insertSQL = `
        INSERT INTO tiktok_comments (post_id, comment_id, user_name, scraped_at)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (comment_id) DO NOTHING
      `;
      
      await client.query(insertSQL, values);
      
      console.log(`📦 배치 INSERT 완료: ${validComments.length}개 댓글 처리`);
      return validComments.length;
      
    } catch (error) {
      console.error('배치 댓글 저장 오류:', error.message);
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * 개별 댓글 저장 (단순화된 버전)
   * @param {Object} commentData - 댓글 데이터 
   * @returns {number|null} 저장된 댓글 ID 또는 null
   */
  async saveComment(commentData) {
    const client = await this.pool.connect();
    
    try {
      const postQuery = await client.query(
        'SELECT id FROM tiktok_post WHERE post_url = $1 AND influencer_id = $2 LIMIT 1',
        [commentData.post_url, commentData.influencer_id]
      );
      
      if (postQuery.rows.length === 0) {
        return null;
      }
      
      const postId = postQuery.rows[0].id;
      const commentId = `${postId}_${commentData.user_name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 단순 INSERT (중복은 무시)
      const insertSQL = `
        INSERT INTO tiktok_comments (post_id, comment_id, user_name, scraped_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (comment_id) DO NOTHING
        RETURNING id
      `;
      
      const result = await client.query(insertSQL, [postId, commentId, commentData.user_name, new Date()]);
      return result.rows.length > 0 ? result.rows[0].id : null;
      
    } catch (error) {
      console.error('댓글 저장 오류:', error.message);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * 댓글 중복 체크 (스트림 처리용 - 최소 정보)
   * @param {string} postUrl - 게시물 URL
   * @param {number} influencerId - 인플루언서 ID
   * @param {string} authorUsername - 댓글 작성자
   * @returns {boolean} 중복 여부
   */
  async checkCommentExists(postUrl, influencerId, authorUsername) {
    const client = await this.pool.connect();
    
    try {
      // 게시물 ID 조회
      const postQuery = await client.query(
        'SELECT id FROM tiktok_post WHERE post_url = $1 AND influencer_id = $2 LIMIT 1',
        [postUrl, influencerId]
      );
      
      if (postQuery.rows.length === 0) {
        return false;
      }
      
      const postId = postQuery.rows[0].id;
      
      const query = `
        SELECT id 
        FROM tiktok_comments 
        WHERE post_id = $1 AND user_name = $2
        LIMIT 1
      `;
      
      const result = await client.query(query, [postId, authorUsername]);
      return result.rows.length > 0;
      
    } catch (error) {
      console.error('댓글 중복 체크 오류:', error.message);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * 스트림 방식 댓글 저장 통계 (최소 정보)
   * @param {number} influencerId - 인플루언서 ID
   * @param {string} postUrl - 게시물 URL
   * @returns {Object} 댓글 저장 통계
   */
  async getCommentsSaveStats(influencerId, postUrl) {
    const client = await this.pool.connect();
    
    try {
      // 게시물 ID 조회
      const postQuery = await client.query(
        'SELECT id FROM tiktok_post WHERE post_url = $1 AND influencer_id = $2 LIMIT 1',
        [postUrl, influencerId]
      );
      
      if (postQuery.rows.length === 0) {
        return {
          total_comments: 0,
          last_collected: null
        };
      }
      
      const postId = postQuery.rows[0].id;
      
      const query = `
        SELECT 
          COUNT(*) as total_comments,
          MAX(scraped_at) as last_collected
        FROM tiktok_comments 
        WHERE post_id = $1
      `;
      
      const result = await client.query(query, [postId]);
      return result.rows[0];
      
    } catch (error) {
      console.error('댓글 통계 조회 오류:', error.message);
      return {
        total_comments: 0,
        last_collected: null
      };
    } finally {
      client.release();
    }
  }

  /**
   * 게시물 상세 정보 업데이트
   */
  async updatePostDetails(postId, detailsData) {
    const client = await this.pool.connect();
    
    try {
      console.log(`🔄 게시물 상세 정보 업데이트 시작: postId=${postId}`);
      console.log(`📝 받은 데이터 구조:`, JSON.stringify(detailsData, null, 2));
      console.log(`📝 업데이트할 데이터 (조회수는 기존 값 유지):`, {
        like_count: detailsData.like_count || detailsData.hearts || 0,
        comment_count: detailsData.comment_count || detailsData.comments || 0,
        share_count: detailsData.share_count || detailsData.shares || 0,
        content: detailsData.content ? detailsData.content.substring(0, 50) + '...' : '',
        hashtags: detailsData.hashtags ? detailsData.hashtags.slice(0, 3) : []
      });
      
      // 업데이트 전 현재 값 확인
      const currentValues = await client.query(
        'SELECT post_url, hearts, comments, shares, plays FROM tiktok_post WHERE id = $1',
        [postId]
      );
      
      if (currentValues.rows.length > 0) {
        const current = currentValues.rows[0];
        console.log(`📊 현재 DB 값: 좋아요=${current.hearts}, 댓글=${current.comments}, 공유=${current.shares}, 조회수=${current.plays}`);
      }
      
      const updateSQL = `
        UPDATE tiktok_post SET 
          content = $2,
          hashtags = $3,
          commerce_hashtags = $4,
          hearts = $5,
          comments = $6,
          shares = $7,
          music_title = $8,
          music_artist = $9,
          length = $10,
          cover = $11,
          video_url = $12,
          upload_date = $13,
          effects_used = $14,
          is_ad = $15,
          raw_data = $16
        WHERE id = $1
        RETURNING id, post_url, hearts, comments, shares, plays;
      `;

      // 조회수는 건드리지 않음! (프로필에서 이미 정확하게 저장됨)
      const values = [
        postId,
        detailsData.content || '',
        Array.isArray(detailsData.hashtags) ? detailsData.hashtags.join(',') : (detailsData.hashtags || ''),
        detailsData.commerce_hashtags || '',
        detailsData.like_count || detailsData.hearts || 0,
        detailsData.comment_count || detailsData.comments || 0,
        detailsData.share_count || detailsData.shares || 0,
        detailsData.music_title || '',
        detailsData.music_artist || '',
        detailsData.video_duration || detailsData.length || 0,
        detailsData.thumbnail_url || detailsData.cover || '',
        detailsData.video_url || '',
        detailsData.upload_date || new Date(),
        detailsData.effects_used || '',
        detailsData.is_ad || false,
        JSON.stringify(detailsData) // raw_data로 원본 데이터 저장
      ];

      console.log(`🔄 SQL 실행 중... 파라미터:`, {
        postId: values[0],
        content_length: values[1].length,
        hashtags: values[2],
        hearts: values[4],
        comments: values[5], 
        shares: values[6],
        music_title: values[7]
      });

      const result = await client.query(updateSQL, values);
      
      if (result.rows.length > 0) {
        const updated = result.rows[0];
        console.log(`✅ 게시물 업데이트 완료: ${updated.post_url}`);
        console.log(`  📊 업데이트된 값: 좋아요=${updated.hearts}, 댓글=${updated.comments}, 공유=${updated.shares}`);
        console.log(`  📺 조회수: ${updated.plays} (프로필에서 수집한 값 유지)`);
        return updated.id;
      } else {
        console.log(`⚠️ 업데이트된 행이 없음: postId=${postId}`);
        return null;
      }

    } catch (error) {
      console.error(`💥 updatePostDetails 오류: postId=${postId}`, error.message);
      console.error(`스택 트레이스:`, error.stack);
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
      
      await client.query('SELECT NOW()');
      
      const profileCount = await client.query('SELECT COUNT(*) FROM tiktok_influencer');
      const postCount = await client.query('SELECT COUNT(*) FROM tiktok_post');
      
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
   * 일반적인 쿼리 실행
   */
  async query(sql, params = []) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result;
    } finally {
      client.release();
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

  /**
   * 성능 추적 데이터 저장
   * @param {Object} performanceData - 성능 데이터
   * @returns {number} 저장된 레코드 ID
   */
  async savePerformanceData(performanceData) {
    const client = await this.pool.connect();
    
    try {
      const insertSQL = `
        INSERT INTO tiktok_scraping_performance (
          session_id, influencer_id, operation_type, start_time, end_time,
          duration_ms, success, error_message, details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;
      
      const values = [
        performanceData.session_id || 'default',
        performanceData.influencer_id,
        performanceData.operation_type,
        performanceData.start_time,
        performanceData.end_time,
        performanceData.duration_ms,
        performanceData.success || false,
        performanceData.error_message || null,
        JSON.stringify(performanceData.details || {})
      ];
      
      const result = await client.query(insertSQL, values);
      return result.rows[0].id;
      
    } catch (error) {
      console.error('성능 데이터 저장 오류:', error.message);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * 해시태그 저장 및 게시물 연결
   * @param {number} postId - 게시물 ID
   * @param {Array} hashtags - 해시태그 배열
   * @returns {number} 저장된 해시태그 수
   */
  async saveHashtags(postId, hashtags) {
    if (!hashtags || hashtags.length === 0) return 0;
    
    const client = await this.pool.connect();
    let savedCount = 0;
    
    try {
      await client.query('BEGIN');
      
      for (const tag of hashtags) {
        if (!tag || tag.trim() === '') continue;
        
        const cleanTag = tag.trim().replace(/^#/, ''); // # 제거
        
        // 해시태그 저장 또는 기존 것 사용
        const hashtagSQL = `
          INSERT INTO tiktok_hashtags (tag_name)
          VALUES ($1)
          ON CONFLICT (tag_name) DO UPDATE SET 
            usage_count = tiktok_hashtags.usage_count + 1
          RETURNING id
        `;
        const hashtagResult = await client.query(hashtagSQL, [cleanTag]);
        const hashtagId = hashtagResult.rows[0].id;
        
        // 게시물과 해시태그 연결
        const linkSQL = `
          INSERT INTO post_hashtags (post_id, hashtag_id)
          VALUES ($1, $2)
          ON CONFLICT (post_id, hashtag_id) DO NOTHING
        `;
        await client.query(linkSQL, [postId, hashtagId]);
        
        savedCount++;
      }
      
      await client.query('COMMIT');
      return savedCount;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('해시태그 저장 오류:', error.message);
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * 스크래핑 시작 로그 저장 (scraping_logs)
   * @param {Object} logData - { task_type, target_type, target_id, status, notes, raw_config }
   * @returns {number} 저장된 로그 ID
   */
  async saveScrapingLogStart(logData) {
    const client = await this.pool.connect();
    try {
      const insertSQL = `
        INSERT INTO scraping_logs (
          task_type, target_type, target_id, status, notes, raw_config, start_time
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `;
      const values = [
        logData.task_type,
        logData.target_type,
        logData.target_id,
        logData.status || 'running',
        logData.notes || null,
        logData.raw_config ? JSON.stringify(logData.raw_config) : null
      ];
      const result = await client.query(insertSQL, values);
      return result.rows[0].id;
    } catch (error) {
      console.error('스크래핑 시작 로그 저장 오류:', error.message);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * 스크래핑 종료 로그 업데이트 (scraping_logs)
   * @param {number} logId - 로그 ID
   * @param {Object} updateData - { status, total_items, processed_items, success_items, failed_items, notes }
   */
  async updateScrapingLogEnd(logId, updateData = {}) {
    const client = await this.pool.connect();
    try {
      const updateSQL = `
        UPDATE scraping_logs SET
          end_time = NOW(),
          duration_seconds = EXTRACT(EPOCH FROM (NOW() - start_time)),
          status = $1,
          total_items = COALESCE($2, total_items),
          processed_items = COALESCE($3, processed_items),
          success_items = COALESCE($4, success_items),
          failed_items = COALESCE($5, failed_items),
          notes = COALESCE($6, notes)
        WHERE id = $7
      `;
      const values = [
        updateData.status || 'completed',
        updateData.total_items,
        updateData.processed_items,
        updateData.success_items,
        updateData.failed_items,
        updateData.notes || null,
        logId
      ];
      await client.query(updateSQL, values);
    } catch (error) {
      console.error('스크래핑 종료 로그 업데이트 오류:', error.message);
    } finally {
      client.release();
    }
  }
}

module.exports = DatabaseService; 