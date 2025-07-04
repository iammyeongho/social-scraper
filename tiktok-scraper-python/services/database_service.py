"""
PostgreSQL 데이터베이스 서비스
"""
import asyncio
import json
import psycopg2
import psycopg2.extras
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from config.settings import settings

class DatabaseService:
    """PostgreSQL 데이터베이스 서비스"""
    
    def __init__(self, db_config=None):
        self.config = db_config or settings.database
        self.connection = None
        self.pool = None
        # 초기화 시점에는 테이블 생성을 시도하지 않음
        # 필요할 때 연결을 확인하고 테이블을 생성함
    
    def _initialize_tables(self):
        """데이터베이스 테이블 초기화"""
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cursor:
                    # TikTok 인플루언서 테이블
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS tiktok_influencer (
                            id BIGSERIAL PRIMARY KEY,
                            tiktok_id VARCHAR(255) UNIQUE NOT NULL,
                            tiktok_name VARCHAR(255),
                            profile_url VARCHAR(500),
                            description TEXT,
                            is_verified BOOLEAN DEFAULT FALSE,
                            following BIGINT DEFAULT 0,
                            followers BIGINT DEFAULT 0,
                            engage_rate DECIMAL(5,2),
                            hearts BIGINT DEFAULT 0,
                            videos INTEGER DEFAULT 0,
                            category VARCHAR(100),
                            country VARCHAR(100),
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    """)
                    
                    # TikTok 게시물 테이블
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS tiktok_post (
                            id BIGSERIAL PRIMARY KEY,
                            influencer_id BIGINT NOT NULL REFERENCES tiktok_influencer(id),
                            post_id VARCHAR(255) UNIQUE,
                            post_url VARCHAR(500),
                            hearts BIGINT DEFAULT 0,
                            shares BIGINT DEFAULT 0,
                            comments BIGINT DEFAULT 0,
                            plays BIGINT DEFAULT 0,
                            hashtags TEXT,
                            content TEXT,
                            video_url VARCHAR(500),
                            upload_date TIMESTAMP,
                            scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            raw_data JSONB
                        )
                    """)
                    
                    # TikTok 팔로워 테이블
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS tiktok_followers (
                            id BIGSERIAL PRIMARY KEY,
                            influencer_id BIGINT NOT NULL REFERENCES tiktok_influencer(id),
                            follower_username VARCHAR(255) NOT NULL,
                            follower_display_name VARCHAR(255),
                            follower_avatar_url VARCHAR(500),
                            is_verified BOOLEAN DEFAULT FALSE,
                            follower_count BIGINT DEFAULT 0,
                            following_count BIGINT DEFAULT 0,
                            discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            raw_data JSONB
                        )
                    """)
                    
                    # TikTok 댓글 테이블
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS tiktok_comments (
                            id BIGSERIAL PRIMARY KEY,
                            post_id BIGINT NOT NULL REFERENCES tiktok_post(id),
                            comment_id VARCHAR(255) UNIQUE,
                            user_name VARCHAR(255),
                            display_name VARCHAR(255),
                            comment_text TEXT,
                            likes_count BIGINT DEFAULT 0,
                            reply_count BIGINT DEFAULT 0,
                            created_at TIMESTAMP,
                            scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            raw_data JSONB
                        )
                    """)
                    
                    # 스크래핑 세션 테이블
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS tiktok_scraping_sessions (
                            id BIGSERIAL PRIMARY KEY,
                            session_name VARCHAR(255),
                            session_start_time TIMESTAMP,
                            session_end_time TIMESTAMP,
                            total_duration_seconds INTEGER,
                            completed_tasks INTEGER DEFAULT 0,
                            total_items_collected INTEGER DEFAULT 0,
                            status VARCHAR(50) DEFAULT 'active',
                            config_snapshot JSONB
                        )
                    """)
                    
                    # 스크래핑 로그 테이블
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS tiktok_scraping_logs (
                            id BIGSERIAL PRIMARY KEY,
                            task_type VARCHAR(50) NOT NULL,
                            target_type VARCHAR(50),
                            target_id VARCHAR(255),
                            status VARCHAR(50) NOT NULL,
                            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            end_time TIMESTAMP,
                            total_items INTEGER DEFAULT 0,
                            notes TEXT,
                            raw_config JSONB,
                            error_message TEXT
                        )
                    """)
                    
                    conn.commit()
                    logger.info("데이터베이스 테이블 초기화 완료")
                    
        except Exception as e:
            logger.error(f"데이터베이스 테이블 초기화 실패: {e}")
            raise
    
    def get_connection(self):
        """데이터베이스 연결 반환"""
        if not self.connection or self.connection.closed:
            self.connection = psycopg2.connect(
                host=self.config.host,
                port=self.config.port,
                database=self.config.database,
                user=self.config.username,
                password=self.config.password,
                cursor_factory=psycopg2.extras.RealDictCursor
            )
        return self.connection
    
    def close_connection(self):
        """데이터베이스 연결 종료"""
        if self.connection and not self.connection.closed:
            self.connection.close()
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def save_influencer(self, influencer_data: Dict[str, Any]) -> int:
        """인플루언서 정보 저장"""
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cursor:
                    # 기존 인플루언서 확인
                    cursor.execute(
                        "SELECT id FROM tiktok_influencer WHERE tiktok_id = %s",
                        (influencer_data.get('tiktok_id'),)
                    )
                    existing = cursor.fetchone()
                    
                    if existing:
                        # 업데이트
                        cursor.execute("""
                            UPDATE tiktok_influencer SET
                                tiktok_name = %s,
                                profile_url = %s,
                                description = %s,
                                is_verified = %s,
                                following = %s,
                                followers = %s,
                                engage_rate = %s,
                                hearts = %s,
                                videos = %s,
                                category = %s,
                                country = %s,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE tiktok_id = %s
                            RETURNING id
                        """, (
                            influencer_data.get('tiktok_name'),
                            influencer_data.get('profile_url'),
                            influencer_data.get('description'),
                            influencer_data.get('is_verified', False),
                            influencer_data.get('following', 0),
                            influencer_data.get('followers', 0),
                            influencer_data.get('engage_rate'),
                            influencer_data.get('hearts', 0),
                            influencer_data.get('videos', 0),
                            influencer_data.get('category'),
                            influencer_data.get('country'),
                            influencer_data.get('tiktok_id')
                        ))
                        influencer_id = cursor.fetchone()['id']
                    else:
                        # 새로 생성
                        cursor.execute("""
                            INSERT INTO tiktok_influencer (
                                tiktok_id, tiktok_name, profile_url, description,
                                is_verified, following, followers, engage_rate,
                                hearts, videos, category, country
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            RETURNING id
                        """, (
                            influencer_data.get('tiktok_id'),
                            influencer_data.get('tiktok_name'),
                            influencer_data.get('profile_url'),
                            influencer_data.get('description'),
                            influencer_data.get('is_verified', False),
                            influencer_data.get('following', 0),
                            influencer_data.get('followers', 0),
                            influencer_data.get('engage_rate'),
                            influencer_data.get('hearts', 0),
                            influencer_data.get('videos', 0),
                            influencer_data.get('category'),
                            influencer_data.get('country')
                        ))
                        influencer_id = cursor.fetchone()['id']
                    
                    conn.commit()
                    logger.info(f"인플루언서 저장 완료: ID={influencer_id}, TikTok ID={influencer_data.get('tiktok_id')}")
                    return influencer_id
                    
        except Exception as e:
            logger.error(f"인플루언서 저장 실패: {e}")
            raise
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def save_posts(self, influencer_id: int, posts: List[Dict[str, Any]]) -> Tuple[int, int]:
        """게시물 목록 저장"""
        saved_count = 0
        total_count = len(posts)
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cursor:
                    for post in posts:
                        try:
                            # 기존 게시물 확인
                            cursor.execute(
                                "SELECT id FROM tiktok_post WHERE post_id = %s",
                                (post.get('post_id'),)
                            )
                            existing = cursor.fetchone()
                            
                            if existing:
                                # 업데이트
                                cursor.execute("""
                                    UPDATE tiktok_post SET
                                        hearts = %s,
                                        shares = %s,
                                        comments = %s,
                                        plays = %s,
                                        hashtags = %s,
                                        content = %s,
                                        video_url = %s,
                                        upload_date = %s,
                                        scraped_at = CURRENT_TIMESTAMP,
                                        raw_data = %s
                                    WHERE post_id = %s
                                """, (
                                    post.get('hearts', 0),
                                    post.get('shares', 0),
                                    post.get('comments', 0),
                                    post.get('plays', 0),
                                    post.get('hashtags'),
                                    post.get('content'),
                                    post.get('video_url'),
                                    post.get('upload_date'),
                                    json.dumps(post.get('raw_data', {})),
                                    post.get('post_id')
                                ))
                            else:
                                # 새로 생성
                                cursor.execute("""
                                    INSERT INTO tiktok_post (
                                        influencer_id, post_id, post_url, hearts, shares,
                                        comments, plays, hashtags, content, video_url,
                                        upload_date, raw_data
                                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                                """, (
                                    influencer_id,
                                    post.get('post_id'),
                                    post.get('post_url'),
                                    post.get('hearts', 0),
                                    post.get('shares', 0),
                                    post.get('comments', 0),
                                    post.get('plays', 0),
                                    post.get('hashtags'),
                                    post.get('content'),
                                    post.get('video_url'),
                                    post.get('upload_date'),
                                    json.dumps(post.get('raw_data', {}))
                                ))
                            
                            saved_count += 1
                            
                        except Exception as e:
                            logger.error(f"게시물 저장 실패 (post_id: {post.get('post_id')}): {e}")
                            continue
                    
                    conn.commit()
                    logger.info(f"게시물 저장 완료: {saved_count}/{total_count}개")
                    return saved_count, total_count
                    
        except Exception as e:
            logger.error(f"게시물 배치 저장 실패: {e}")
            raise
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def save_followers(self, influencer_id: int, followers: List[Dict[str, Any]]) -> int:
        """팔로워 목록 저장"""
        saved_count = 0
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cursor:
                    for follower in followers:
                        try:
                            # 기존 팔로워 확인
                            cursor.execute("""
                                SELECT id FROM tiktok_followers 
                                WHERE influencer_id = %s AND follower_username = %s
                            """, (influencer_id, follower.get('follower_username')))
                            existing = cursor.fetchone()
                            
                            if existing:
                                # 업데이트
                                cursor.execute("""
                                    UPDATE tiktok_followers SET
                                        follower_display_name = %s,
                                        follower_avatar_url = %s,
                                        is_verified = %s,
                                        follower_count = %s,
                                        following_count = %s,
                                        scraped_at = CURRENT_TIMESTAMP,
                                        raw_data = %s
                                    WHERE influencer_id = %s AND follower_username = %s
                                """, (
                                    follower.get('follower_display_name'),
                                    follower.get('follower_avatar_url'),
                                    follower.get('is_verified', False),
                                    follower.get('follower_count', 0),
                                    follower.get('following_count', 0),
                                    json.dumps(follower.get('raw_data', {})),
                                    influencer_id,
                                    follower.get('follower_username')
                                ))
                            else:
                                # 새로 생성
                                cursor.execute("""
                                    INSERT INTO tiktok_followers (
                                        influencer_id, follower_username, follower_display_name,
                                        follower_avatar_url, is_verified, follower_count,
                                        following_count, raw_data
                                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                                """, (
                                    influencer_id,
                                    follower.get('follower_username'),
                                    follower.get('follower_display_name'),
                                    follower.get('follower_avatar_url'),
                                    follower.get('is_verified', False),
                                    follower.get('follower_count', 0),
                                    follower.get('following_count', 0),
                                    json.dumps(follower.get('raw_data', {}))
                                ))
                            
                            saved_count += 1
                            
                        except Exception as e:
                            logger.error(f"팔로워 저장 실패 (username: {follower.get('follower_username')}): {e}")
                            continue
                    
                    conn.commit()
                    logger.info(f"팔로워 저장 완료: {saved_count}명")
                    return saved_count
                    
        except Exception as e:
            logger.error(f"팔로워 배치 저장 실패: {e}")
            raise
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def save_comments(self, post_id: int, comments: List[Dict[str, Any]]) -> int:
        """댓글 목록 저장"""
        saved_count = 0
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cursor:
                    for comment in comments:
                        try:
                            # 기존 댓글 확인
                            cursor.execute(
                                "SELECT id FROM tiktok_comments WHERE comment_id = %s",
                                (comment.get('comment_id'),)
                            )
                            existing = cursor.fetchone()
                            
                            if existing:
                                # 업데이트
                                cursor.execute("""
                                    UPDATE tiktok_comments SET
                                        user_name = %s,
                                        display_name = %s,
                                        comment_text = %s,
                                        likes_count = %s,
                                        reply_count = %s,
                                        created_at = %s,
                                        scraped_at = CURRENT_TIMESTAMP,
                                        raw_data = %s
                                    WHERE comment_id = %s
                                """, (
                                    comment.get('user_name'),
                                    comment.get('display_name'),
                                    comment.get('comment_text'),
                                    comment.get('likes_count', 0),
                                    comment.get('reply_count', 0),
                                    comment.get('created_at'),
                                    json.dumps(comment.get('raw_data', {})),
                                    comment.get('comment_id')
                                ))
                            else:
                                # 새로 생성
                                cursor.execute("""
                                    INSERT INTO tiktok_comments (
                                        post_id, comment_id, user_name, display_name,
                                        comment_text, likes_count, reply_count, created_at, raw_data
                                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                                """, (
                                    post_id,
                                    comment.get('comment_id'),
                                    comment.get('user_name'),
                                    comment.get('display_name'),
                                    comment.get('comment_text'),
                                    comment.get('likes_count', 0),
                                    comment.get('reply_count', 0),
                                    comment.get('created_at'),
                                    json.dumps(comment.get('raw_data', {}))
                                ))
                            
                            saved_count += 1
                            
                        except Exception as e:
                            logger.error(f"댓글 저장 실패 (comment_id: {comment.get('comment_id')}): {e}")
                            continue
                    
                    conn.commit()
                    logger.info(f"댓글 저장 완료: {saved_count}개")
                    return saved_count
                    
        except Exception as e:
            logger.error(f"댓글 배치 저장 실패: {e}")
            raise
    
    def save_scraping_log_start(self, log_data: Dict[str, Any]) -> int:
        """스크래핑 로그 시작 저장"""
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO tiktok_scraping_logs (
                            task_type, target_type, target_id, status, notes, raw_config
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        log_data.get('task_type'),
                        log_data.get('target_type'),
                        log_data.get('target_id'),
                        log_data.get('status', 'running'),
                        log_data.get('notes'),
                        json.dumps(log_data.get('raw_config', {}))
                    ))
                    
                    log_id = cursor.fetchone()['id']
                    conn.commit()
                    logger.info(f"스크래핑 로그 시작 저장: ID={log_id}")
                    return log_id
                    
        except Exception as e:
            logger.error(f"스크래핑 로그 시작 저장 실패: {e}")
            raise
    
    def update_scraping_log_end(self, log_id: int, end_data: Dict[str, Any]):
        """스크래핑 로그 종료 업데이트"""
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        UPDATE tiktok_scraping_logs SET
                            status = %s,
                            end_time = CURRENT_TIMESTAMP,
                            total_items = %s,
                            notes = %s
                        WHERE id = %s
                    """, (
                        end_data.get('status'),
                        end_data.get('total_items', 0),
                        end_data.get('notes'),
                        log_id
                    ))
                    
                    conn.commit()
                    logger.info(f"스크래핑 로그 종료 업데이트: ID={log_id}")
                    
        except Exception as e:
            logger.error(f"스크래핑 로그 종료 업데이트 실패: {e}")
            raise
    
    def get_status(self) -> Dict[str, Any]:
        """데이터베이스 상태 조회"""
        try:
            # 먼저 연결 테스트
            with self.get_connection() as conn:
                # 연결이 성공하면 테이블 초기화 시도
                try:
                    self._initialize_tables()
                except Exception as table_error:
                    logger.warning(f"테이블 초기화 실패: {table_error}")
                
                with conn.cursor() as cursor:
                    # 테이블별 레코드 수 조회
                    cursor.execute("SELECT COUNT(*) as count FROM tiktok_influencer")
                    influencer_count = cursor.fetchone()['count']
                    
                    cursor.execute("SELECT COUNT(*) as count FROM tiktok_post")
                    post_count = cursor.fetchone()['count']
                    
                    cursor.execute("SELECT COUNT(*) as count FROM tiktok_followers")
                    follower_count = cursor.fetchone()['count']
                    
                    cursor.execute("SELECT COUNT(*) as count FROM tiktok_comments")
                    comment_count = cursor.fetchone()['count']
                    
                    return {
                        "status": "connected",
                        "influencer_count": influencer_count,
                        "post_count": post_count,
                        "follower_count": follower_count,
                        "comment_count": comment_count,
                        "timestamp": datetime.now().isoformat()
                    }
                    
        except Exception as e:
            logger.error(f"데이터베이스 상태 조회 실패: {e}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            } 