"""
TikTok 스크래퍼 메인 서비스
"""
import asyncio
import time
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from config.settings import settings
from .database_service import DatabaseService
from .performance_tracker import PerformanceTracker
from scrapers.tiktok_profile_scraper import TikTokProfileScraper
from scrapers.tiktok_post_scraper import TikTokPostScraper
from scrapers.tiktok_follower_scraper import TikTokFollowerScraper
from scrapers.tiktok_comment_scraper import TikTokCommentScraper

class TikTokScraper:
    """TikTok 스크래퍼 메인 서비스"""
    
    def __init__(self, db_service: DatabaseService = None, performance_tracker: PerformanceTracker = None):
        self.db_service = db_service or DatabaseService()
        self.performance_tracker = performance_tracker or PerformanceTracker(self.db_service)
        
        # 개별 스크래퍼들
        self.profile_scraper = None
        self.post_scraper = None
        self.follower_scraper = None
        self.comment_scraper = None
        
        # 스크래핑 큐
        self.influencer_queue = asyncio.Queue()
        self.processing_results = []
        
        # 설정
        self.config = settings.tiktok
        self.base_config = settings.base
        
        # 스트림 처리 플래그
        self.use_stream_processing = True
    
    async def initialize(self) -> bool:
        """스크래퍼 초기화"""
        try:
            logger.info("=== TikTok 스크래퍼 초기화 시작 ===")
            
            # 1. 데이터베이스 연결 확인
            db_status = self.db_service.get_status()
            if db_status.get("status") != "connected":
                logger.warning("데이터베이스 연결 실패 - 메모리 모드로 실행")
                logger.warning("스크래핑 결과는 데이터베이스에 저장되지 않습니다")
            else:
                logger.info("✓ 데이터베이스 연결 확인")
            
            # 2. 성능 추적 세션 시작
            session_id = self.performance_tracker.start_session("tiktok_scraping_session")
            logger.info(f"✓ 성능 추적 세션 시작: {session_id}")
            
            # 3. 개별 스크래퍼들 초기화
            await self._initialize_scrapers()
            logger.info("✓ 개별 스크래퍼 초기화 완료")
            
            logger.info("=== TikTok 스크래퍼 초기화 완료 ===")
            return True
            
        except Exception as e:
            logger.error(f"TikTok 스크래퍼 초기화 실패: {e}")
            return False
    
    async def _initialize_scrapers(self):
        """개별 스크래퍼들 초기화"""
        # 프로필 스크래퍼
        self.profile_scraper = TikTokProfileScraper(
            db_service=self.db_service,
            performance_tracker=self.performance_tracker,
            config=self.config
        )
        await self.profile_scraper.initialize()
        
        # 게시물 스크래퍼
        self.post_scraper = TikTokPostScraper(
            db_service=self.db_service,
            performance_tracker=self.performance_tracker,
            config=self.config
        )
        await self.post_scraper.initialize()
        
        # 팔로워 스크래퍼
        self.follower_scraper = TikTokFollowerScraper(
            db_service=self.db_service,
            performance_tracker=self.performance_tracker,
            config=self.config
        )
        await self.follower_scraper.initialize()
        
        # 댓글 스크래퍼
        self.comment_scraper = TikTokCommentScraper(
            db_service=self.db_service,
            performance_tracker=self.performance_tracker,
            config=self.config
        )
        await self.comment_scraper.initialize()
    
    def add_influencers_to_queue(self, influencer_ids: List[str]):
        """인플루언서 ID들을 스크래핑 큐에 추가"""
        for influencer_id in influencer_ids:
            self.influencer_queue.put_nowait(influencer_id)
        
        logger.info(f"스크래핑 큐에 {len(influencer_ids)}개의 인플루언서 ID 추가")
    
    async def process_all_influencers(self) -> List[Dict[str, Any]]:
        """모든 인플루언서 처리"""
        results = []
        
        try:
            logger.info("=== 인플루언서 스크래핑 시작 ===")
            
            # 큐에서 인플루언서 ID들을 모두 가져오기
            influencer_ids = []
            while not self.influencer_queue.empty():
                try:
                    influencer_id = self.influencer_queue.get_nowait()
                    influencer_ids.append(influencer_id)
                except asyncio.QueueEmpty:
                    break
            
            if not influencer_ids:
                logger.warning("처리할 인플루언서가 없습니다.")
                return results
            
            logger.info(f"총 {len(influencer_ids)}개의 인플루언서 처리 시작")
            
            # 동시 처리 제한
            semaphore = asyncio.Semaphore(self.base_config.max_concurrent_tasks)
            
            # 인플루언서들을 동시에 처리
            tasks = []
            for influencer_id in influencer_ids:
                task = asyncio.create_task(
                    self._process_influencer_with_semaphore(semaphore, influencer_id)
                )
                tasks.append(task)
            
            # 모든 작업 완료 대기
            completed_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 결과 정리
            for result in completed_results:
                if isinstance(result, Exception):
                    logger.error(f"인플루언서 처리 중 오류: {result}")
                elif result:
                    results.append(result)
            
            logger.info(f"인플루언서 스크래핑 완료: {len(results)}개 성공")
            return results
            
        except Exception as e:
            logger.error(f"인플루언서 스크래핑 실패: {e}")
            return results
    
    async def _process_influencer_with_semaphore(self, semaphore: asyncio.Semaphore, influencer_id: str) -> Optional[Dict[str, Any]]:
        """세마포어를 사용한 인플루언서 처리"""
        async with semaphore:
            return await self._process_single_influencer(influencer_id)
    
    async def _process_single_influencer(self, influencer_id: str) -> Optional[Dict[str, Any]]:
        """단일 인플루언서 처리"""
        task_id = f"influencer_{influencer_id}_{int(time.time())}"
        
        try:
            # 작업 시작
            self.performance_tracker.start_task(task_id, "influencer_scraping", {
                "influencer_id": influencer_id
            })
            
            logger.info(f"인플루언서 처리 시작: {influencer_id}")
            
            result = {
                "influencer_id": influencer_id,
                "profile": None,
                "posts": [],
                "followers": [],
                "comments": [],
                "streamProcessed": False,
                "legacyProcessed": False,
                "profileId": None,
                "savedPosts": 0,
                "totalPosts": 0,
                "savedComments": 0
            }
            
            # 1. 프로필 정보 수집
            profile_result = await self._scrape_profile(influencer_id, task_id)
            if profile_result:
                result["profile"] = profile_result["profile"]
                result["profileId"] = profile_result["profileId"]
                
                # 스트림 처리 모드인 경우 즉시 저장
                if self.use_stream_processing and result["profileId"]:
                    await self._process_posts_stream(influencer_id, result["profileId"], task_id)
                    await self._process_followers_stream(influencer_id, result["profileId"], task_id)
                    result["streamProcessed"] = True
                else:
                    # 레거시 배치 처리 모드
                    await self._process_posts_batch(influencer_id, task_id)
                    await self._process_followers_batch(influencer_id, task_id)
                    result["legacyProcessed"] = True
            
            # 작업 완료
            self.performance_tracker.end_task(
                task_id, 
                "completed",
                items_processed=1,
                items_success=1 if result["profile"] else 0,
                items_failed=0 if result["profile"] else 1
            )
            
            logger.info(f"인플루언서 처리 완료: {influencer_id}")
            return result
            
        except Exception as e:
            logger.error(f"인플루언서 처리 실패: {influencer_id} - {e}")
            
            # 작업 실패 기록
            self.performance_tracker.end_task(
                task_id,
                "failed",
                items_processed=1,
                items_success=0,
                items_failed=1,
                error_count=1
            )
            
            return None
    
    async def _scrape_profile(self, influencer_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        """프로필 정보 스크래핑"""
        try:
            profile_data = await self.profile_scraper.scrape_profile(influencer_id)
            
            if profile_data:
                # 데이터베이스에 저장 (연결된 경우에만)
                profile_id = None
                if hasattr(self.db_service, 'save_influencer'):
                    try:
                        profile_id = self.db_service.save_influencer(profile_data)
                    except Exception as db_error:
                        logger.warning(f"프로필 데이터베이스 저장 실패: {db_error}")
                        profile_id = None
                
                self.performance_tracker.update_task_progress(
                    task_id, 
                    items_processed=1,
                    items_success=1
                )
                
                return {
                    "profile": profile_data,
                    "profileId": profile_id
                }
            
            return None
            
        except Exception as e:
            logger.error(f"프로필 스크래핑 실패: {influencer_id} - {e}")
            self.performance_tracker.increment_task_errors(task_id)
            return None
    
    async def _process_posts_stream(self, influencer_id: str, profile_id: int, task_id: str):
        """게시물 스트림 처리"""
        try:
            posts = await self.post_scraper.scrape_posts(influencer_id)
            
            if posts:
                # 게시물들을 즉시 저장 (연결된 경우에만)
                saved_count, total_count = len(posts), len(posts)
                if hasattr(self.db_service, 'save_posts') and profile_id:
                    try:
                        saved_count, total_count = self.db_service.save_posts(profile_id, posts)
                    except Exception as db_error:
                        logger.warning(f"게시물 데이터베이스 저장 실패: {db_error}")
                
                self.performance_tracker.update_task_progress(
                    task_id,
                    items_processed=total_count,
                    items_success=saved_count
                )
                
                # 각 게시물의 댓글 수집
                for post in posts[:self.config.max_comments_per_post]:
                    await self._scrape_comments_for_post(post, task_id)
            
        except Exception as e:
            logger.error(f"게시물 스트림 처리 실패: {influencer_id} - {e}")
            self.performance_tracker.increment_task_errors(task_id)
    
    async def _process_posts_batch(self, influencer_id: str, task_id: str):
        """게시물 배치 처리"""
        try:
            posts = await self.post_scraper.scrape_posts(influencer_id)
            
            if posts:
                self.performance_tracker.update_task_progress(
                    task_id,
                    items_processed=len(posts),
                    items_success=len(posts)
                )
            
        except Exception as e:
            logger.error(f"게시물 배치 처리 실패: {influencer_id} - {e}")
            self.performance_tracker.increment_task_errors(task_id)
    
    async def _process_followers_stream(self, influencer_id: str, profile_id: int, task_id: str):
        """팔로워 스트림 처리"""
        try:
            followers = await self.follower_scraper.scrape_followers(influencer_id)
            
            if followers:
                # 팔로워들을 즉시 저장 (연결된 경우에만)
                saved_count = len(followers)
                if hasattr(self.db_service, 'save_followers') and profile_id:
                    try:
                        saved_count = self.db_service.save_followers(profile_id, followers)
                    except Exception as db_error:
                        logger.warning(f"팔로워 데이터베이스 저장 실패: {db_error}")
                
                self.performance_tracker.update_task_progress(
                    task_id,
                    items_processed=len(followers),
                    items_success=saved_count
                )
            
        except Exception as e:
            logger.error(f"팔로워 스트림 처리 실패: {influencer_id} - {e}")
            self.performance_tracker.increment_task_errors(task_id)
    
    async def _process_followers_batch(self, influencer_id: str, task_id: str):
        """팔로워 배치 처리"""
        try:
            followers = await self.follower_scraper.scrape_followers(influencer_id)
            
            if followers:
                self.performance_tracker.update_task_progress(
                    task_id,
                    items_processed=len(followers),
                    items_success=len(followers)
                )
            
        except Exception as e:
            logger.error(f"팔로워 배치 처리 실패: {influencer_id} - {e}")
            self.performance_tracker.increment_task_errors(task_id)
    
    async def _scrape_comments_for_post(self, post: Dict[str, Any], task_id: str):
        """게시물 댓글 스크래핑"""
        try:
            comments = await self.comment_scraper.scrape_comments(post.get("post_id"))
            
            if comments:
                # 댓글들을 즉시 저장 (연결된 경우에만)
                saved_count = len(comments)
                if hasattr(self.db_service, 'save_comments') and post.get("id"):
                    try:
                        saved_count = self.db_service.save_comments(post.get("id"), comments)
                    except Exception as db_error:
                        logger.warning(f"댓글 데이터베이스 저장 실패: {db_error}")
                
                self.performance_tracker.update_task_progress(
                    task_id,
                    items_processed=len(comments),
                    items_success=saved_count
                )
            
        except Exception as e:
            logger.error(f"댓글 스크래핑 실패: {post.get('post_id')} - {e}")
            self.performance_tracker.increment_task_errors(task_id)
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """성능 요약 정보 반환"""
        return self.performance_tracker.get_session_summary()
    
    def print_performance_report(self):
        """성능 보고서 출력"""
        self.performance_tracker.print_performance_report()
    
    async def cleanup(self):
        """리소스 정리"""
        try:
            logger.info("=== TikTok 스크래퍼 정리 시작 ===")
            
            # 성능 추적 세션 종료
            self.performance_tracker.end_session("completed")
            
            # 개별 스크래퍼들 정리
            if self.profile_scraper:
                await self.profile_scraper.cleanup()
            if self.post_scraper:
                await self.post_scraper.cleanup()
            if self.follower_scraper:
                await self.follower_scraper.cleanup()
            if self.comment_scraper:
                await self.comment_scraper.cleanup()
            
            # 데이터베이스 연결 종료
            self.db_service.close_connection()
            
            logger.info("=== TikTok 스크래퍼 정리 완료 ===")
            
        except Exception as e:
            logger.error(f"TikTok 스크래퍼 정리 실패: {e}") 