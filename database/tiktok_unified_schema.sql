-- TikTok Scraper Unified Database Schema
-- 실제 사용하는 모든 테이블을 포함한 통합 최적화 스키마
-- UTF-8 encoding, PostgreSQL 13+

-- 기존 테이블 삭제 (종속성 순서로)
DROP TABLE IF EXISTS post_hashtags CASCADE;
DROP TABLE IF EXISTS tiktok_hashtags CASCADE;
DROP TABLE IF EXISTS error_logs CASCADE;
DROP TABLE IF EXISTS scraping_logs CASCADE;
DROP TABLE IF EXISTS tiktok_comments CASCADE;
DROP TABLE IF EXISTS tiktok_post CASCADE;
DROP TABLE IF EXISTS tiktok_followers CASCADE;
DROP TABLE IF EXISTS tiktok_follower_stats CASCADE;
DROP TABLE IF EXISTS tiktok_scraping_performance CASCADE;
DROP TABLE IF EXISTS tiktok_scraping_sessions CASCADE;
DROP TABLE IF EXISTS tiktok_scraping_config CASCADE;
DROP TABLE IF EXISTS tiktok_influencer CASCADE;

-- ==============================================
-- 1. TikTok 인플루언서 테이블
-- ==============================================
CREATE TABLE tiktok_influencer (
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
CREATE TABLE tiktok_post (
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
CREATE TABLE tiktok_comments (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    comment_id VARCHAR(255) UNIQUE,
    parent_comment_id BIGINT,
    author_username VARCHAR(255),
    author_display_name VARCHAR(255),
    author_verified BOOLEAN DEFAULT FALSE,
    comment_text TEXT,
    like_count BIGINT DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    comment_date TIMESTAMP,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB,
    FOREIGN KEY (post_id) REFERENCES tiktok_post(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES tiktok_comments(id) ON DELETE SET NULL
);

-- ==============================================
-- 4. TikTok 팔로워 테이블
-- ==============================================
CREATE TABLE tiktok_followers (
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
CREATE TABLE tiktok_follower_stats (
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
CREATE TABLE tiktok_hashtags (
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
CREATE TABLE post_hashtags (
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
CREATE TABLE tiktok_scraping_performance (
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
CREATE TABLE tiktok_scraping_sessions (
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
CREATE TABLE tiktok_scraping_config (
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
CREATE TABLE scraping_logs (
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
CREATE TABLE error_logs (
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
CREATE INDEX idx_tiktok_influencer_tiktok_id ON tiktok_influencer(tiktok_id);
CREATE INDEX idx_tiktok_influencer_followers ON tiktok_influencer(followers DESC);
CREATE INDEX idx_tiktok_influencer_category ON tiktok_influencer(category);
CREATE INDEX idx_tiktok_influencer_updated_at ON tiktok_influencer(updated_at DESC);

-- 게시물 인덱스
CREATE INDEX idx_tiktok_post_influencer_id ON tiktok_post(influencer_id);
CREATE INDEX idx_tiktok_post_hearts ON tiktok_post(hearts DESC);
CREATE INDEX idx_tiktok_post_upload_date ON tiktok_post(upload_date DESC);
CREATE INDEX idx_tiktok_post_scraped_at ON tiktok_post(scraped_at DESC);

-- 댓글 인덱스
CREATE INDEX idx_tiktok_comments_post_id ON tiktok_comments(post_id);
CREATE INDEX idx_tiktok_comments_author ON tiktok_comments(author_username);
CREATE INDEX idx_tiktok_comments_date ON tiktok_comments(comment_date DESC);

-- 팔로워 인덱스
CREATE INDEX idx_tiktok_followers_influencer_id ON tiktok_followers(influencer_id);
CREATE INDEX idx_tiktok_followers_username ON tiktok_followers(follower_username);
CREATE INDEX idx_tiktok_followers_scraped_at ON tiktok_followers(scraped_at DESC);
CREATE INDEX idx_tiktok_follower_stats_influencer_id ON tiktok_follower_stats(influencer_id);

-- 해시태그 인덱스
CREATE INDEX idx_tiktok_hashtags_trending ON tiktok_hashtags(trending_score DESC);
CREATE INDEX idx_post_hashtags_post_id ON post_hashtags(post_id);
CREATE INDEX idx_post_hashtags_hashtag_id ON post_hashtags(hashtag_id);

-- 성능 추적 인덱스
CREATE INDEX idx_scraping_performance_session_id ON tiktok_scraping_performance(session_id);
CREATE INDEX idx_scraping_performance_task_type ON tiktok_scraping_performance(task_type);
CREATE INDEX idx_scraping_performance_start_time ON tiktok_scraping_performance(start_time DESC);
CREATE INDEX idx_scraping_sessions_status ON tiktok_scraping_sessions(status);
CREATE INDEX idx_scraping_config_key ON tiktok_scraping_config(config_key);

-- 로그 인덱스
CREATE INDEX idx_scraping_logs_status ON scraping_logs(status);
CREATE INDEX idx_scraping_logs_start_time ON scraping_logs(start_time DESC);
CREATE INDEX idx_scraping_logs_task_type ON scraping_logs(task_type);
CREATE INDEX idx_error_logs_occurred_at ON error_logs(occurred_at DESC);
CREATE INDEX idx_error_logs_error_type ON error_logs(error_type);

-- ==============================================
-- 기본 설정 데이터 삽입
-- ==============================================
INSERT INTO tiktok_scraping_config (config_key, config_value, config_type, description) VALUES
('max_followers_per_influencer', '1000', 'integer', 'Maximum followers to scrape per influencer'),
('max_comments_per_post', '500', 'integer', 'Maximum comments to scrape per post'),
('max_posts_per_influencer', '50', 'integer', 'Maximum posts to scrape per influencer'),
('scraping_delay_ms', '2000', 'integer', 'Delay between requests in milliseconds'),
('max_retry_attempts', '3', 'integer', 'Maximum retry attempts for failed requests'),
('enable_performance_tracking', 'true', 'boolean', 'Enable detailed performance tracking');

-- ==============================================
-- 유용한 뷰 생성
-- ==============================================

-- 인플루언서 실시간 통계
CREATE VIEW influencer_realtime_stats AS
SELECT 
    i.id,
    i.tiktok_name,
    i.followers,
    COUNT(DISTINCT p.id) as actual_posts,
    COUNT(DISTINCT c.id) as total_comments,
    COUNT(DISTINCT f.id) as total_followers_scraped,
    AVG(p.hearts) as real_avg_hearts,
    AVG(p.plays) as real_avg_plays,
    MAX(p.upload_date) as latest_post_date
FROM tiktok_influencer i
LEFT JOIN tiktok_post p ON i.id = p.influencer_id
LEFT JOIN tiktok_comments c ON p.id = c.post_id
LEFT JOIN tiktok_followers f ON i.id = f.influencer_id
GROUP BY i.id, i.tiktok_name, i.followers
ORDER BY i.followers DESC;

-- 스크래핑 작업 현황
CREATE VIEW scraping_status AS
SELECT 
    task_type,
    status,
    COUNT(*) as task_count,
    AVG(duration_seconds) as avg_duration,
    SUM(processed_items) as total_processed,
    MAX(start_time) as last_run
FROM scraping_logs
GROUP BY task_type, status
ORDER BY task_type, status;

-- 에러 발생 빈도
CREATE VIEW error_frequency AS
SELECT 
    error_type,
    COUNT(*) as error_count,
    COUNT(DISTINCT DATE(occurred_at)) as error_days,
    MAX(occurred_at) as last_occurrence
FROM error_logs
WHERE occurred_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY error_type
ORDER BY error_count DESC;

-- 성능 통계 뷰
CREATE VIEW performance_summary AS
SELECT 
    task_type,
    COUNT(*) as total_tasks,
    AVG(duration_seconds) as avg_duration,
    AVG(items_collected) as avg_items_collected,
    AVG(success_rate) as avg_success_rate,
    MAX(start_time) as last_execution
FROM tiktok_scraping_performance
GROUP BY task_type
ORDER BY avg_duration DESC;

-- ==============================================
-- 트리거 함수 및 트리거 생성
-- ==============================================

-- updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
CREATE TRIGGER update_tiktok_influencer_updated_at 
    BEFORE UPDATE ON tiktok_influencer 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tiktok_scraping_config_updated_at 
    BEFORE UPDATE ON tiktok_scraping_config 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 코멘트 추가
-- ==============================================
COMMENT ON TABLE tiktok_influencer IS 'TikTok 인플루언서 프로필 정보';
COMMENT ON TABLE tiktok_post IS 'TikTok 게시물 정보';
COMMENT ON TABLE tiktok_comments IS 'TikTok 댓글 정보';
COMMENT ON TABLE tiktok_followers IS 'TikTok 팔로워 정보';
COMMENT ON TABLE tiktok_follower_stats IS 'TikTok 팔로워 통계';
COMMENT ON TABLE tiktok_hashtags IS 'TikTok 해시태그 정보';
COMMENT ON TABLE post_hashtags IS '게시물-해시태그 관계';
COMMENT ON TABLE tiktok_scraping_performance IS '스크래핑 성능 추적';
COMMENT ON TABLE tiktok_scraping_sessions IS '스크래핑 세션 관리';
COMMENT ON TABLE tiktok_scraping_config IS '스크래핑 설정';
COMMENT ON TABLE scraping_logs IS '스크래핑 작업 로그';
COMMENT ON TABLE error_logs IS '에러 로그';

-- ==============================================
-- 스키마 정보
-- ==============================================
-- 생성일: 2025-01-27
-- 버전: 1.0
-- PostgreSQL 13+ 호환
-- 실제 사용 테이블 12개 모두 포함
-- 최적화된 인덱스 및 뷰 포함
-- ==============================================
