-- TikTok Scraper Database Schema for PostgreSQL
-- TikTok 데이터 수집을 위한 간단한 데이터베이스 스키마

-- 기존 테이블 삭제 (있다면)
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
    engage_rate DECIMAL(5,2), -- 참여율 (쿼리 대체 가능)
    hearts BIGINT DEFAULT 0,
    avg_heart DECIMAL(10,2), -- 평균 좋아요 (쿼리 대체 가능)
    avg_comments DECIMAL(10,2), -- 평균 댓글 (쿼리 대체 가능)
    avg_shares DECIMAL(10,2),
    avg_plays DECIMAL(15,2),
    videos INTEGER DEFAULT 0, -- 비디오 수 (쿼리 대체 가능)
    avg_length DECIMAL(8,2), -- 평균 길이 (초)
    category VARCHAR(100),
    country VARCHAR(100),
    lang VARCHAR(10),
    last_post_dt TIMESTAMP, -- 마지막 게시물 날짜 (쿼리 대체 가능)
    g_rate_followers DECIMAL(5,2), -- 팔로워 증가율 (쿼리 대체 가능)
    g_rate_engage_rate DECIMAL(5,2), -- 참여율 증가율 (쿼리 대체 가능)
    active_user_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TikTok 게시물 테이블
CREATE TABLE tiktok_post (
    id BIGSERIAL PRIMARY KEY,
    influencer_id BIGINT NOT NULL REFERENCES tiktok_influencer(id) ON DELETE CASCADE,
    post_id VARCHAR(255) UNIQUE, -- TikTok 게시물 ID
    post_url VARCHAR(500), -- 게시물 URL
    length INTEGER, -- 비디오 길이 (초)
    cover VARCHAR(500), -- 커버 이미지 URL
    hearts BIGINT DEFAULT 0, -- 좋아요 수
    shares BIGINT DEFAULT 0, -- 공유 수
    comments BIGINT DEFAULT 0, -- 댓글 수
    plays BIGINT DEFAULT 0, -- 재생 수
    hashtags TEXT, -- 해시태그들 (JSON 또는 콤마 구분)
    commerce_hashtags TEXT, -- 상업적 해시태그
    is_ad BOOLEAN DEFAULT FALSE, -- 광고 여부
    content TEXT, -- 게시물 내용
    upload_date TIMESTAMP, -- 업로드 날짜
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX idx_tiktok_influencer_tiktok_id ON tiktok_influencer(tiktok_id);
CREATE INDEX idx_tiktok_influencer_followers ON tiktok_influencer(followers DESC);
CREATE INDEX idx_tiktok_influencer_updated_at ON tiktok_influencer(updated_at DESC);

CREATE INDEX idx_tiktok_post_influencer_id ON tiktok_post(influencer_id);
CREATE INDEX idx_tiktok_post_hearts ON tiktok_post(hearts DESC);
CREATE INDEX idx_tiktok_post_upload_date ON tiktok_post(upload_date DESC);
CREATE INDEX idx_tiktok_post_scraped_at ON tiktok_post(scraped_at DESC);

-- updated_at 자동 업데이트 트리거 함수
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

CREATE TRIGGER update_tiktok_post_updated_at 
    BEFORE UPDATE ON tiktok_post 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 유용한 뷰: 인플루언서 통계
CREATE VIEW tiktok_influencer_stats AS
SELECT 
    ti.id,
    ti.tiktok_id,
    ti.tiktok_name,
    ti.followers,
    COUNT(tp.id) as total_posts,
    AVG(tp.hearts) as avg_hearts_actual,
    AVG(tp.comments) as avg_comments_actual,
    AVG(tp.shares) as avg_shares_actual,
    AVG(tp.plays) as avg_plays_actual,
    MAX(tp.upload_date) as last_post_date
FROM tiktok_influencer ti
LEFT JOIN tiktok_post tp ON ti.id = tp.influencer_id
GROUP BY ti.id, ti.tiktok_id, ti.tiktok_name, ti.followers
ORDER BY ti.followers DESC;

-- 댓글: 스키마 완성
COMMENT ON TABLE tiktok_influencer IS 'TikTok 인플루언서 프로필 정보';
COMMENT ON TABLE tiktok_post IS 'TikTok 게시물 정보';
COMMENT ON COLUMN tiktok_influencer.engage_rate IS '참여율 (쿼리로 계산 가능)';
COMMENT ON COLUMN tiktok_influencer.avg_heart IS '평균 좋아요 (쿼리로 계산 가능)';
COMMENT ON COLUMN tiktok_influencer.videos IS '비디오 수 (쿼리로 계산 가능)'; 