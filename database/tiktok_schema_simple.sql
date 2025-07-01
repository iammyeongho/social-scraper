-- TikTok Scraper Database Schema (Simple Version)
-- TikTok 데이터 수집을 위한 간단한 데이터베이스 스키마

-- 기존 테이블 삭제
DROP TABLE IF EXISTS tiktok_post;
DROP TABLE IF EXISTS tiktok_influencer;

-- TikTok 인플루언서 테이블
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TikTok 게시물 테이블
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
    upload_date TIMESTAMP,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (influencer_id) REFERENCES tiktok_influencer(id) ON DELETE CASCADE
);

-- 인덱스 생성
CREATE INDEX idx_tiktok_influencer_tiktok_id ON tiktok_influencer(tiktok_id);
CREATE INDEX idx_tiktok_influencer_followers ON tiktok_influencer(followers);
CREATE INDEX idx_tiktok_post_influencer_id ON tiktok_post(influencer_id);
CREATE INDEX idx_tiktok_post_hearts ON tiktok_post(hearts);
CREATE INDEX idx_tiktok_post_upload_date ON tiktok_post(upload_date);

-- 샘플 데이터 확인용 뷰
CREATE VIEW tiktok_summary AS
SELECT 
    ti.tiktok_name,
    ti.followers,
    COUNT(tp.id) as post_count,
    AVG(tp.hearts) as avg_hearts,
    MAX(tp.upload_date) as last_post
FROM tiktok_influencer ti
LEFT JOIN tiktok_post tp ON ti.id = tp.influencer_id
GROUP BY ti.id, ti.tiktok_name, ti.followers
ORDER BY ti.followers DESC; 