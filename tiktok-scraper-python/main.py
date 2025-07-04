"""
TikTok Scraper 메인 실행 파일
"""
import asyncio
import sys
import os
from datetime import datetime
from loguru import logger

# 프로젝트 루트를 Python 경로에 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config.settings import settings
from services.database_service import DatabaseService
from services.api_client import ApiClient
from services.performance_tracker import PerformanceTracker
from services.tiktok_scraper import TikTokScraper

class TikTokScrapingSystem:
    """TikTok 스크래핑 시스템"""
    
    def __init__(self):
        self.api_client = None
        self.database_service = None
        self.performance_tracker = None
        self.tiktok_scraper = None
        
        # 스크래핑 로그 ID
        self.scraping_log_id = None
        
        # 로깅 설정
        self._setup_logging()
    
    def _setup_logging(self):
        """로깅 설정"""
        # 로그 디렉토리 생성
        os.makedirs("logs", exist_ok=True)
        os.makedirs("screenshots", exist_ok=True)
        
        # 로그 설정
        logger.remove()  # 기본 핸들러 제거
        
        # 콘솔 출력
        logger.add(
            sys.stdout,
            format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
            level=settings.base.log_level
        )
        
        # 파일 출력
        logger.add(
            settings.base.log_file,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
            level=settings.base.log_level,
            rotation="10 MB",
            retention="7 days"
        )
    
    async def initialize(self) -> bool:
        """시스템 초기화"""
        try:
            logger.info("=== TikTok 스크래핑 시스템 초기화 ===")
            
            # 1. 설정 검증
            if not settings.validate():
                logger.error("설정 검증 실패")
                return False
            
            settings.print_config()
            
            # 2. API 클라이언트 초기화
            self.api_client = ApiClient(settings.api)
            
            # API 사용 여부에 따라 상태 확인
            if settings.api.use_api:
                api_status = await self.api_client.check_api_status()
                if not api_status:
                    logger.error("TikTok API 연결 실패")
                    return False
                logger.info("✓ TikTok API 연결 성공")
            else:
                logger.info("✓ 테스트 모드 - API 연결 없이 테스트용 인플루언서 목록 사용")
            
            # 3. 데이터베이스 서비스 초기화
            self.database_service = DatabaseService(settings.database)
            db_status = self.database_service.get_status()
            if db_status.get("status") != "connected":
                logger.warning("데이터베이스 연결 실패 - 메모리 모드로 실행")
                logger.warning("스크래핑 결과는 데이터베이스에 저장되지 않습니다")
                # 데이터베이스 없이도 스크래핑은 계속 진행
            else:
                logger.info("✓ TikTok 데이터베이스 연결 성공")
                logger.info(f"데이터베이스 상태: {db_status}")
            
            # 4. 성능 추적기 초기화
            self.performance_tracker = PerformanceTracker(self.database_service)
            
            # 5. TikTok 스크래퍼 초기화
            self.tiktok_scraper = TikTokScraper(
                db_service=self.database_service,
                performance_tracker=self.performance_tracker
            )
            scraper_initialized = await self.tiktok_scraper.initialize()
            if not scraper_initialized:
                logger.error("TikTok 스크래퍼 초기화 실패")
                return False
            logger.info("✓ TikTok 스크래퍼 초기화 성공")
            
            logger.info("=== TikTok 시스템 초기화 완료 ===")
            return True
            
        except Exception as e:
            logger.error(f"TikTok 시스템 초기화 오류: {e}")
            return False
    
    async def run_scraping_process(self):
        """전체 TikTok 스크래핑 프로세스 실행"""
        try:
            # 스크래핑 시작 로그 기록 (데이터베이스가 연결된 경우에만)
            self.scraping_log_id = None
            if hasattr(self.database_service, 'save_scraping_log_start'):
                try:
                    self.scraping_log_id = self.database_service.save_scraping_log_start({
                        "task_type": "tiktok",
                        "target_type": "all",
                        "target_id": None,
                        "status": "running",
                        "notes": "전체 TikTok 스크래핑 시작",
                        "raw_config": settings.all_configs
                    })
                except Exception as e:
                    logger.warning(f"스크래핑 로그 기록 실패: {e}")
            
            logger.info("=== TikTok 스크래핑 프로세스 시작 ===")
            
            # 1. 서드파티 API에서 TikTok 인플루언서 ID 목록 받아오기
            logger.info("1단계: 인플루언서 ID 목록 요청...")
            async with self.api_client as api_client:
                influencer_ids = await api_client.get_influencer_ids()
            
            logger.info(f"받아온 인플루언서 ID: {influencer_ids}")
            
            if not influencer_ids or len(influencer_ids) == 0:
                logger.info("처리할 TikTok 인플루언서가 없습니다.")
                # 스크래핑 종료 로그 기록 (결과 없음)
                if self.scraping_log_id and hasattr(self.database_service, 'update_scraping_log_end'):
                    try:
                        self.database_service.update_scraping_log_end(self.scraping_log_id, {
                            "status": "no_data",
                            "total_items": 0,
                            "notes": "처리할 인플루언서 없음"
                        })
                    except Exception as e:
                        logger.warning(f"스크래핑 로그 업데이트 실패: {e}")
                return
            
            logger.info(f"{len(influencer_ids)}개의 TikTok 인플루언서 ID를 받았습니다.")
            
            # 2. 인플루언서 ID를 스크래핑 큐에 추가
            logger.info("2단계: 스크래핑 큐에 추가...")
            self.tiktok_scraper.add_influencers_to_queue(influencer_ids)
            logger.info("스크래핑 큐 추가 완료")
            
            # 3. 순차적으로 인플루언서 스크래핑 및 데이터 저장
            logger.info("3단계: 인플루언서 스크래핑 실행...")
            results = await self.tiktok_scraper.process_all_influencers()
            
            logger.info(f"스크래핑 결과: {len(results) if results else 0}개")
            
            if not results or len(results) == 0:
                logger.info("TikTok 스크래핑 결과가 없습니다.")
                # 스크래핑 종료 로그 기록 (결과 없음)
                if self.scraping_log_id and hasattr(self.database_service, 'update_scraping_log_end'):
                    try:
                        self.database_service.update_scraping_log_end(self.scraping_log_id, {
                            "status": "no_result",
                            "total_items": 0,
                            "notes": "스크래핑 결과 없음"
                        })
                    except Exception as e:
                        logger.warning(f"스크래핑 로그 업데이트 실패: {e}")
                return
            
            # 4. 스크래핑 결과 분석
            logger.info("4단계: 스크래핑 결과 분석...")
            save_results = await self._analyze_scraping_results(results)
            
            # 5. 결과를 API로 전송
            logger.info("5단계: 결과를 API로 전송...")
            await self._send_results_to_api(results)
            
            # 6. 결과 요약
            self._print_summary(results, save_results)
            
            # 스크래핑 종료 로그 기록 (정상 완료)
            if self.scraping_log_id and hasattr(self.database_service, 'update_scraping_log_end'):
                try:
                    self.database_service.update_scraping_log_end(self.scraping_log_id, {
                        "status": "completed",
                        "total_items": len(results),
                        "notes": "전체 TikTok 스크래핑 정상 종료"
                    })
                except Exception as e:
                    logger.warning(f"스크래핑 로그 업데이트 실패: {e}")
            
            logger.info("=== TikTok 스크래핑 프로세스 완료 ===")
            
        except Exception as e:
            logger.error(f"TikTok 스크래핑 프로세스 실패: {e}")
            
            # 스크래핑 종료 로그 기록 (실패)
            if self.scraping_log_id and hasattr(self.database_service, 'update_scraping_log_end'):
                try:
                    self.database_service.update_scraping_log_end(self.scraping_log_id, {
                        "status": "failed",
                        "total_items": 0,
                        "notes": f"스크래핑 실패: {str(e)}"
                    })
                except Exception as log_error:
                    logger.warning(f"스크래핑 로그 업데이트 실패: {log_error}")
    
    async def _analyze_scraping_results(self, results: list) -> list:
        """스크래핑 결과 분석"""
        save_results = []
        
        for result in results:
            try:
                logger.info(f"\n처리 결과 분석: {result.get('influencer_id')}")
                
                if result.get("streamProcessed"):
                    # 스트림 처리된 결과 - 이미 저장 완료
                    logger.info(f"스트림 처리 완료됨:")
                    logger.info(f"  - 프로필 ID: {result.get('profileId')}")
                    logger.info(f"  - 저장된 게시물: {result.get('savedPosts', 0)}/{result.get('totalPosts', 0)}개")
                    logger.info(f"  - 상세 정보 업데이트: {result.get('detailedPosts', 0)}개")
                    logger.info(f"  - 저장된 댓글: {result.get('savedComments', 0)}개 게시물")
                    
                    save_results.append({
                        "profileId": result.get("profileId"),
                        "savedPosts": result.get("savedPosts", 0),
                        "totalPosts": result.get("totalPosts", 0),
                        "detailedPosts": result.get("detailedPosts", 0),
                        "savedComments": result.get("savedComments", 0),
                        "streamProcessed": True
                    })
                    
                elif result.get("legacyProcessed"):
                    # 기존 배치 처리된 결과 - 별도 저장 필요
                    logger.info(f"배치 처리 결과 - 별도 저장 시작:")
                    logger.info(f"  - 프로필: ✓")
                    logger.info(f"  - 게시물: {len(result.get('posts', []))}개")
                    logger.info(f"  - 팔로워: {len(result.get('followers', []))}명")
                    logger.info(f"  - 상세 게시물: {len(result.get('detailed_posts', []))}개")
                    logger.info(f"  - 댓글: {len(result.get('comments', []))}개 게시물")
                    
                    # 기존 배치 처리 저장 로직
                    save_result = await self._save_influencer_data(result)
                    logger.info(f"프로필 저장 완료: profileId={save_result.get('profileId')}, 게시물={save_result.get('savedPosts')}/{save_result.get('totalPosts')}개")
                    
                    # 팔로워 데이터 저장
                    if result.get("followers") and len(result.get("followers", [])) > 0:
                        logger.info(f"팔로워 데이터 저장 중: {len(result.get('followers'))}명")
                        saved_followers = await self._save_followers_data(save_result.get("profileId"), result.get("followers"))
                        logger.info(f"팔로워 저장 완료: {saved_followers}명")
                    
                    save_results.append(save_result)
                    
                else:
                    logger.warning(f"알 수 없는 처리 방식: {result.get('influencer_id')}")
                
            except Exception as e:
                logger.error(f"결과 처리 실패: {result.get('influencer_id')}")
                logger.error(f"오류 상세: {e}")
        
        return save_results
    
    async def _save_influencer_data(self, result: dict) -> dict:
        """인플루언서 데이터 저장"""
        try:
            # 데이터베이스가 연결되지 않은 경우
            if not hasattr(self.database_service, 'save_influencer'):
                logger.warning("데이터베이스가 연결되지 않아 데이터 저장을 건너뜁니다")
                return {
                    "profileId": None,
                    "savedPosts": len(result.get("posts", [])),
                    "totalPosts": len(result.get("posts", [])),
                    "detailedPosts": 0,
                    "savedComments": 0,
                    "streamProcessed": False
                }
            
            # 프로필 저장
            profile_id = self.database_service.save_influencer(result.get("profile", {}))
            
            # 게시물 저장
            posts = result.get("posts", [])
            saved_posts, total_posts = self.database_service.save_posts(profile_id, posts)
            
            return {
                "profileId": profile_id,
                "savedPosts": saved_posts,
                "totalPosts": total_posts,
                "detailedPosts": 0,
                "savedComments": 0,
                "streamProcessed": False
            }
            
        except Exception as e:
            logger.error(f"인플루언서 데이터 저장 실패: {e}")
            return {
                "profileId": None,
                "savedPosts": 0,
                "totalPosts": 0,
                "detailedPosts": 0,
                "savedComments": 0,
                "streamProcessed": False
            }
    
    async def _save_followers_data(self, profile_id: int, followers: list) -> int:
        """팔로워 데이터 저장"""
        try:
            # 데이터베이스가 연결되지 않은 경우
            if not hasattr(self.database_service, 'save_followers'):
                logger.warning("데이터베이스가 연결되지 않아 팔로워 데이터 저장을 건너뜁니다")
                return len(followers)
            
            return self.database_service.save_followers(profile_id, followers)
        except Exception as e:
            logger.error(f"팔로워 데이터 저장 실패: {e}")
            return 0
    
    async def _send_results_to_api(self, results: list):
        """결과를 API로 전송"""
        try:
            async with self.api_client as api_client:
                success = await api_client.send_scraping_results(results)
                if success:
                    logger.info("스크래핑 결과 API 전송 성공")
                else:
                    logger.error("스크래핑 결과 API 전송 실패")
        except Exception as e:
            logger.error(f"스크래핑 결과 API 전송 실패: {e}")
    
    def _print_summary(self, scraping_results: list, save_results: list):
        """결과 요약 출력"""
        print("\n" + "="*80)
        print("TIKTOK SCRAPER 결과 요약")
        print("="*80)
        
        # 스크래핑 결과 요약
        print(f"총 처리된 인플루언서: {len(scraping_results)}개")
        
        successful_results = [r for r in scraping_results if r.get("profile")]
        print(f"성공적으로 스크래핑된 인플루언서: {len(successful_results)}개")
        
        # 저장 결과 요약
        total_saved_posts = sum(r.get("savedPosts", 0) for r in save_results)
        total_posts = sum(r.get("totalPosts", 0) for r in save_results)
        total_saved_comments = sum(r.get("savedComments", 0) for r in save_results)
        
        print(f"총 저장된 게시물: {total_saved_posts}/{total_posts}개")
        print(f"총 저장된 댓글: {total_saved_comments}개 게시물")
        
        # 성능 정보
        if self.performance_tracker:
            performance_summary = self.performance_tracker.get_session_summary()
            print(f"총 소요 시간: {performance_summary.get('current_duration', 0):.2f}초")
            print(f"평균 작업 시간: {performance_summary.get('average_task_duration', 0):.2f}초")
        
        print("="*80)
        
        # 상세 결과
        print("\n상세 결과:")
        print("-"*80)
        for i, result in enumerate(scraping_results, 1):
            profile = result.get("profile", {})
            username = profile.get("tiktok_name", profile.get("api_influencer_id", f"Unknown_{i}"))
            
            print(f"{i}. @{username}:")
            print(f"   - 프로필: {'✓' if profile else '✗'}")
            print(f"   - 게시물: {len(result.get('posts', []))}개")
            print(f"   - 팔로워: {len(result.get('followers', []))}명")
            print(f"   - 상세 게시물: {len(result.get('detailed_posts', []))}개")
            print(f"   - 댓글: {len(result.get('comments', []))}개 게시물")
        
        print("="*80)
    
    async def get_system_status(self) -> dict:
        """시스템 상태 조회"""
        try:
            status = {
                "timestamp": datetime.now().isoformat(),
                "system": "TikTok Scraper Python",
                "version": "1.0.0"
            }
            
            # API 상태
            if self.api_client:
                api_status = await self.api_client.check_api_status()
                status["api_status"] = "connected" if api_status else "disconnected"
            else:
                status["api_status"] = "not_initialized"
            
            # 데이터베이스 상태
            if self.database_service:
                db_status = self.database_service.get_status()
                status["database_status"] = db_status
            else:
                status["database_status"] = {"status": "not_initialized"}
            
            # 성능 추적 상태
            if self.performance_tracker:
                performance_summary = self.performance_tracker.get_session_summary()
                status["performance"] = performance_summary
            else:
                status["performance"] = {"status": "not_initialized"}
            
            return status
            
        except Exception as e:
            logger.error(f"시스템 상태 조회 실패: {e}")
            return {
                "timestamp": datetime.now().isoformat(),
                "error": str(e)
            }
    
    async def cleanup(self):
        """리소스 정리"""
        try:
            logger.info("=== TikTok 스크래핑 시스템 정리 시작 ===")
            
            # TikTok 스크래퍼 정리
            if self.tiktok_scraper:
                await self.tiktok_scraper.cleanup()
            
            # API 클라이언트 정리
            if self.api_client:
                await self.api_client.close()
            
            # 데이터베이스 연결 정리
            if self.database_service:
                self.database_service.close_connection()
            
            logger.info("=== TikTok 스크래핑 시스템 정리 완료 ===")
            
        except Exception as e:
            logger.error(f"TikTok 스크래핑 시스템 정리 실패: {e}")

async def main():
    """메인 함수"""
    system = TikTokScrapingSystem()
    
    try:
        # 시스템 초기화
        if not await system.initialize():
            logger.error("시스템 초기화 실패")
            return
        
        # 스크래핑 프로세스 실행
        await system.run_scraping_process()
        
        # 성능 보고서 출력
        if system.performance_tracker:
            system.performance_tracker.print_performance_report()
        
    except KeyboardInterrupt:
        logger.info("사용자에 의해 중단됨")
    except Exception as e:
        logger.error(f"메인 프로세스 실패: {e}")
    finally:
        # 리소스 정리
        await system.cleanup()

if __name__ == "__main__":
    # 비동기 이벤트 루프 실행
    asyncio.run(main()) 