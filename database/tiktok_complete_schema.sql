-- TikTok Scraper Complete Database Schema
-- 댓글, 로그, 에러 정보까지 포함한 완전한 스키마

-- 기존 테이블 삭제 (역순으로)
DROP TABLE IF EXISTS scraping_logs;
DROP TABLE IF EXISTS error_logs;
DROP TABLE IF EXISTS tiktok_comments;
DROP TABLE IF EXISTS tiktok_post;
DROP TABLE IF EXISTS tiktok_influencer;

-- 1. TikTok 인플루언서 테이블
CREATE TABLE tiktok_influencer (
    id BIGSERIAL PRIMARY KEY,
    tiktok_id VARCHAR(255) UNIQUE,
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

-- 2. TikTok 게시물 테이블
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
    FOREIGN KEY (influencer_id) REFERENCES tiktok_influencer(id)
);

-- 3. TikTok 댓글 테이블
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
    FOREIGN KEY (post_id) REFERENCES tiktok_post(id),
    FOREIGN KEY (parent_comment_id) REFERENCES tiktok_comments(id)
);

-- 4. 스크래핑 작업 로그 테이블
CREATE TABLE scraping_logs (
    id BIGSERIAL PRIMARY KEY,
    task_type VARCHAR(50) NOT NULL, -- 'profile', 'posts', 'comments', 'full'
    target_type VARCHAR(50) NOT NULL, -- 'influencer', 'post', 'hashtag'
    target_id VARCHAR(255), -- 대상 ID (username, post_id 등)
    status VARCHAR(50) NOT NULL, -- 'started', 'running', 'completed', 'failed', 'paused'
    total_items INTEGER DEFAULT 0, -- 전체 처리할 항목 수
    processed_items INTEGER DEFAULT 0, -- 처리된 항목 수
    success_items INTEGER DEFAULT 0, -- 성공한 항목 수
    failed_items INTEGER DEFAULT 0, -- 실패한 항목 수
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    last_checkpoint VARCHAR(255), -- 마지막 처리 위치 (재시작용)
    notes TEXT,
    raw_config JSONB -- 실행 설정 정보
);

-- 5. 에러 로그 테이블
CREATE TABLE error_logs (
    id BIGSERIAL PRIMARY KEY,
    scraping_log_id BIGINT,
    error_type VARCHAR(100), -- 'network', 'parsing', 'database', 'auth', 'rate_limit'
    error_code VARCHAR(50),
    error_message TEXT,
    error_details JSONB, -- 상세 에러 정보
    target_url VARCHAR(500),
    retry_count INTEGER DEFAULT 0,
    is_resolved BOOLEAN DEFAULT FALSE,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scraping_log_id) REFERENCES scraping_logs(id)
);

-- 6. 해시태그 통계 테이블 (추가)
CREATE TABLE tiktok_hashtags (
    id BIGSERIAL PRIMARY KEY,
    hashtag VARCHAR(255) UNIQUE,
    total_posts BIGINT DEFAULT 0,
    avg_hearts DECIMAL(15,2),
    avg_views DECIMAL(15,2),
    trending_score DECIMAL(8,2),
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. 게시물-해시태그 관계 테이블
CREATE TABLE post_hashtags (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    hashtag_id BIGINT NOT NULL,
    position_in_post INTEGER, -- 해시태그 순서
    FOREIGN KEY (post_id) REFERENCES tiktok_post(id),
    FOREIGN KEY (hashtag_id) REFERENCES tiktok_hashtags(id),
    UNIQUE(post_id, hashtag_id)
);

-- 인덱스 생성
-- 인플루언서 인덱스
CREATE INDEX idx_tiktok_influencer_tiktok_id ON tiktok_influencer(tiktok_id);
CREATE INDEX idx_tiktok_influencer_followers ON tiktok_influencer(followers DESC);
CREATE INDEX idx_tiktok_influencer_category ON tiktok_influencer(category);

-- 게시물 인덱스
CREATE INDEX idx_tiktok_post_influencer_id ON tiktok_post(influencer_id);
CREATE INDEX idx_tiktok_post_hearts ON tiktok_post(hearts DESC);
CREATE INDEX idx_tiktok_post_upload_date ON tiktok_post(upload_date DESC);
CREATE INDEX idx_tiktok_post_scraped_at ON tiktok_post(scraped_at DESC);

-- 댓글 인덱스
CREATE INDEX idx_tiktok_comments_post_id ON tiktok_comments(post_id);
CREATE INDEX idx_tiktok_comments_author ON tiktok_comments(author_username);
CREATE INDEX idx_tiktok_comments_date ON tiktok_comments(comment_date DESC);
CREATE INDEX idx_tiktok_comments_parent ON tiktok_comments(parent_comment_id);

-- 로그 인덱스
CREATE INDEX idx_scraping_logs_status ON scraping_logs(status);
CREATE INDEX idx_scraping_logs_start_time ON scraping_logs(start_time DESC);
CREATE INDEX idx_scraping_logs_task_type ON scraping_logs(task_type);
CREATE INDEX idx_error_logs_occurred_at ON error_logs(occurred_at DESC);
CREATE INDEX idx_error_logs_error_type ON error_logs(error_type);

-- 해시태그 인덱스
CREATE INDEX idx_tiktok_hashtags_trending ON tiktok_hashtags(trending_score DESC);
CREATE INDEX idx_post_hashtags_post_id ON post_hashtags(post_id);

-- 유용한 뷰들
-- 인플루언서 실시간 통계
CREATE VIEW influencer_realtime_stats AS
SELECT 
    i.id,
    i.tiktok_name,
    i.followers,
    COUNT(DISTINCT p.id) as actual_posts,
    COUNT(DISTINCT c.id) as total_comments,
    AVG(p.hearts) as real_avg_hearts,
    AVG(p.plays) as real_avg_plays,
    MAX(p.upload_date) as latest_post_date
FROM tiktok_influencer i
LEFT JOIN tiktok_post p ON i.id = p.influencer_id
LEFT JOIN tiktok_comments c ON p.id = c.post_id
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