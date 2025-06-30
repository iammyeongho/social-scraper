-- Social Scraper Database Schema for PostgreSQL
-- 소셜 미디어 데이터 수집을 위한 데이터베이스 스키마

-- UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 플랫폼 테이블
CREATE TABLE platforms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL, -- 'instagram', 'tiktok', 'youtube' 등
    base_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 인플루언서 프로필 테이블
CREATE TABLE influencer_profiles (
    id SERIAL PRIMARY KEY,
    platform_id INTEGER REFERENCES platforms(id),
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    bio TEXT,
    follower_count BIGINT DEFAULT 0,
    following_count BIGINT DEFAULT 0,
    post_count BIGINT DEFAULT 0,
    profile_image_url TEXT,
    external_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_private BOOLEAN DEFAULT FALSE,
    location VARCHAR(255),
    additional_data JSONB, -- 플랫폼별 추가 정보 저장
    first_scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(platform_id, username) -- 플랫폼별 유니크 사용자명
);

-- 게시물 테이블
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER REFERENCES influencer_profiles(id),
    platform_id INTEGER REFERENCES platforms(id),
    post_url TEXT UNIQUE NOT NULL,
    post_id VARCHAR(255), -- 플랫폼별 게시물 ID
    post_type VARCHAR(50), -- 'photo', 'video', 'carousel', 'reel' 등
    content TEXT,
    like_count BIGINT DEFAULT 0,
    comment_count BIGINT DEFAULT 0,
    share_count BIGINT DEFAULT 0,
    bookmark_count BIGINT DEFAULT 0,
    view_count BIGINT DEFAULT 0,
    video_duration INTEGER, -- 초 단위
    video_url TEXT,
    thumbnail_url TEXT,
    music_title VARCHAR(255),
    music_artist VARCHAR(255),
    location VARCHAR(255),
    upload_date TIMESTAMP WITH TIME ZONE,
    additional_data JSONB, -- 플랫폼별 추가 정보 (원본 JSON 데이터)
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 해시태그 테이블
CREATE TABLE hashtags (
    id SERIAL PRIMARY KEY,
    platform_id INTEGER REFERENCES platforms(id),
    tag_name VARCHAR(255) NOT NULL,
    tag_url TEXT,
    usage_count BIGINT DEFAULT 0, -- 사용된 횟수
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(platform_id, tag_name)
);

-- 게시물-해시태그 관계 테이블
CREATE TABLE post_hashtags (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    hashtag_id INTEGER REFERENCES hashtags(id),
    tag_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(post_id, hashtag_id)
);

-- 멘션 테이블
CREATE TABLE mentions (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL,
    mention_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 스크래핑 작업 로그 테이블
CREATE TABLE scraping_logs (
    id SERIAL PRIMARY KEY,
    platform_id INTEGER REFERENCES platforms(id),
    profile_id INTEGER REFERENCES influencer_profiles(id),
    scraping_type VARCHAR(50), -- 'profile', 'posts', 'full'
    status VARCHAR(50), -- 'started', 'completed', 'failed'
    posts_scraped INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER
);

-- 인덱스 생성
CREATE INDEX idx_posts_profile_id ON posts(profile_id);
CREATE INDEX idx_posts_upload_date ON posts(upload_date DESC);
CREATE INDEX idx_posts_platform_id ON posts(platform_id);
CREATE INDEX idx_posts_scraped_at ON posts(scraped_at DESC);
CREATE INDEX idx_profiles_platform_username ON influencer_profiles(platform_id, username);
CREATE INDEX idx_profiles_last_scraped ON influencer_profiles(last_scraped_at DESC);
CREATE INDEX idx_hashtags_platform_name ON hashtags(platform_id, tag_name);
CREATE INDEX idx_post_hashtags_post_id ON post_hashtags(post_id);

-- JSONB 필드 인덱스 (PostgreSQL 특화)
CREATE INDEX idx_posts_additional_data_gin ON posts USING GIN (additional_data);
CREATE INDEX idx_profiles_additional_data_gin ON influencer_profiles USING GIN (additional_data);

-- 트리거 함수: updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
CREATE TRIGGER update_influencer_profiles_updated_at 
    BEFORE UPDATE ON influencer_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at 
    BEFORE UPDATE ON posts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hashtags_updated_at 
    BEFORE UPDATE ON hashtags 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 기본 플랫폼 데이터 삽입
INSERT INTO platforms (name, base_url) VALUES 
('instagram', 'https://www.instagram.com'),
('tiktok', 'https://www.tiktok.com'),
('youtube', 'https://www.youtube.com');

-- 뷰: 최근 스크래핑된 게시물 요약
CREATE VIEW recent_posts_summary AS
SELECT 
    p.name as platform_name,
    ip.username,
    ip.display_name,
    COUNT(po.id) as total_posts,
    MAX(po.upload_date) as latest_post_date,
    MAX(po.scraped_at) as last_scraped,
    SUM(po.like_count) as total_likes,
    SUM(po.comment_count) as total_comments
FROM platforms p
JOIN influencer_profiles ip ON p.id = ip.platform_id
LEFT JOIN posts po ON ip.id = po.profile_id
GROUP BY p.id, p.name, ip.id, ip.username, ip.display_name
ORDER BY last_scraped DESC;

-- 뷰: 인기 해시태그
CREATE VIEW popular_hashtags AS
SELECT 
    p.name as platform_name,
    h.tag_name,
    COUNT(ph.post_id) as usage_count,
    MAX(po.upload_date) as last_used
FROM platforms p
JOIN hashtags h ON p.id = h.platform_id
JOIN post_hashtags ph ON h.id = ph.hashtag_id
JOIN posts po ON ph.post_id = po.id
GROUP BY p.id, p.name, h.id, h.tag_name
ORDER BY usage_count DESC, last_used DESC; 