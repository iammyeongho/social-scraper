"""
성능 추적 서비스
"""
import asyncio
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from loguru import logger

from config.settings import settings

@dataclass
class TaskMetrics:
    """작업 메트릭"""
    task_id: str
    task_type: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: Optional[float] = None
    items_processed: int = 0
    items_success: int = 0
    items_failed: int = 0
    error_count: int = 0
    retry_count: int = 0
    status: str = "running"
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class SessionMetrics:
    """세션 메트릭"""
    session_id: str
    session_name: str
    start_time: datetime
    end_time: Optional[datetime] = None
    total_duration: Optional[float] = None
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    total_items_collected: int = 0
    total_errors: int = 0
    status: str = "active"
    config_snapshot: Dict[str, Any] = field(default_factory=dict)

class PerformanceTracker:
    """성능 추적 서비스"""
    
    def __init__(self, db_service=None):
        self.db_service = db_service
        self.current_session: Optional[SessionMetrics] = None
        self.active_tasks: Dict[str, TaskMetrics] = {}
        self.completed_tasks: List[TaskMetrics] = []
        self.session_start_time = None
        
    def start_session(self, session_name: str = "tiktok_scraping_session") -> str:
        """새 세션 시작"""
        session_id = f"session_{int(time.time())}"
        
        self.current_session = SessionMetrics(
            session_id=session_id,
            session_name=session_name,
            start_time=datetime.now(),
            config_snapshot=settings.all_configs
        )
        
        self.session_start_time = time.time()
        logger.info(f"성능 추적 세션 시작: {session_id} - {session_name}")
        
        return session_id
    
    def end_session(self, status: str = "completed"):
        """세션 종료"""
        if not self.current_session:
            logger.warning("종료할 활성 세션이 없습니다.")
            return
        
        self.current_session.end_time = datetime.now()
        self.current_session.total_duration = time.time() - self.session_start_time
        self.current_session.status = status
        
        # 완료된 작업들 계산
        self.current_session.completed_tasks = len([t for t in self.completed_tasks if t.status == "completed"])
        self.current_session.failed_tasks = len([t for t in self.completed_tasks if t.status == "failed"])
        self.current_session.total_tasks = len(self.completed_tasks)
        self.current_session.total_items_collected = sum(t.items_success for t in self.completed_tasks)
        self.current_session.total_errors = sum(t.error_count for t in self.completed_tasks)
        
        logger.info(f"성능 추적 세션 종료: {self.current_session.session_id}")
        logger.info(f"총 작업: {self.current_session.total_tasks}, 완료: {self.current_session.completed_tasks}, 실패: {self.current_session.failed_tasks}")
        logger.info(f"총 수집 아이템: {self.current_session.total_items_collected}, 총 오류: {self.current_session.total_errors}")
        logger.info(f"총 소요 시간: {self.current_session.total_duration:.2f}초")
        
        # 데이터베이스에 세션 저장
        if self.db_service:
            try:
                self.db_service.save_scraping_session(self.current_session)
            except Exception as e:
                logger.error(f"세션 데이터베이스 저장 실패: {e}")
    
    def start_task(self, task_id: str, task_type: str, metadata: Dict[str, Any] = None) -> str:
        """작업 시작"""
        task_metrics = TaskMetrics(
            task_id=task_id,
            task_type=task_type,
            start_time=datetime.now(),
            metadata=metadata or {}
        )
        
        self.active_tasks[task_id] = task_metrics
        logger.debug(f"작업 시작: {task_id} ({task_type})")
        
        return task_id
    
    def end_task(self, task_id: str, status: str = "completed", items_processed: int = 0, 
                 items_success: int = 0, items_failed: int = 0, error_count: int = 0):
        """작업 종료"""
        if task_id not in self.active_tasks:
            logger.warning(f"종료할 작업이 없습니다: {task_id}")
            return
        
        task = self.active_tasks[task_id]
        task.end_time = datetime.now()
        task.duration = (task.end_time - task.start_time).total_seconds()
        task.status = status
        task.items_processed = items_processed
        task.items_success = items_success
        task.items_failed = items_failed
        task.error_count = error_count
        
        # 완료된 작업 목록으로 이동
        self.completed_tasks.append(task)
        del self.active_tasks[task_id]
        
        logger.debug(f"작업 종료: {task_id} - {status} ({task.duration:.2f}초)")
    
    def update_task_progress(self, task_id: str, items_processed: int = None, 
                           items_success: int = None, items_failed: int = None, 
                           error_count: int = None, retry_count: int = None):
        """작업 진행 상황 업데이트"""
        if task_id not in self.active_tasks:
            logger.warning(f"업데이트할 작업이 없습니다: {task_id}")
            return
        
        task = self.active_tasks[task_id]
        
        if items_processed is not None:
            task.items_processed = items_processed
        if items_success is not None:
            task.items_success = items_success
        if items_failed is not None:
            task.items_failed = items_failed
        if error_count is not None:
            task.error_count = error_count
        if retry_count is not None:
            task.retry_count = retry_count
    
    def increment_task_errors(self, task_id: str, count: int = 1):
        """작업 오류 수 증가"""
        if task_id in self.active_tasks:
            self.active_tasks[task_id].error_count += count
    
    def increment_task_retries(self, task_id: str, count: int = 1):
        """작업 재시도 수 증가"""
        if task_id in self.active_tasks:
            self.active_tasks[task_id].retry_count += count
    
    def get_session_summary(self) -> Dict[str, Any]:
        """세션 요약 정보 반환"""
        if not self.current_session:
            return {"error": "활성 세션이 없습니다."}
        
        active_task_count = len(self.active_tasks)
        completed_task_count = len([t for t in self.completed_tasks if t.status == "completed"])
        failed_task_count = len([t for t in self.completed_tasks if t.status == "failed"])
        
        total_items = sum(t.items_success for t in self.completed_tasks)
        total_errors = sum(t.error_count for t in self.completed_tasks)
        
        current_duration = time.time() - self.session_start_time if self.session_start_time else 0
        
        return {
            "session_id": self.current_session.session_id,
            "session_name": self.current_session.session_name,
            "status": self.current_session.status,
            "start_time": self.current_session.start_time.isoformat(),
            "current_duration": current_duration,
            "active_tasks": active_task_count,
            "completed_tasks": completed_task_count,
            "failed_tasks": failed_task_count,
            "total_items_collected": total_items,
            "total_errors": total_errors,
            "average_task_duration": self._calculate_average_task_duration()
        }
    
    def get_task_summary(self, task_id: str) -> Optional[Dict[str, Any]]:
        """작업 요약 정보 반환"""
        # 활성 작업에서 찾기
        if task_id in self.active_tasks:
            task = self.active_tasks[task_id]
            current_duration = (datetime.now() - task.start_time).total_seconds()
            
            return {
                "task_id": task.task_id,
                "task_type": task.task_type,
                "status": task.status,
                "start_time": task.start_time.isoformat(),
                "current_duration": current_duration,
                "items_processed": task.items_processed,
                "items_success": task.items_success,
                "items_failed": task.items_failed,
                "error_count": task.error_count,
                "retry_count": task.retry_count
            }
        
        # 완료된 작업에서 찾기
        for task in self.completed_tasks:
            if task.task_id == task_id:
                return {
                    "task_id": task.task_id,
                    "task_type": task.task_type,
                    "status": task.status,
                    "start_time": task.start_time.isoformat(),
                    "end_time": task.end_time.isoformat() if task.end_time else None,
                    "duration": task.duration,
                    "items_processed": task.items_processed,
                    "items_success": task.items_success,
                    "items_failed": task.items_failed,
                    "error_count": task.error_count,
                    "retry_count": task.retry_count
                }
        
        return None
    
    def get_all_tasks_summary(self) -> List[Dict[str, Any]]:
        """모든 작업 요약 정보 반환"""
        summaries = []
        
        # 활성 작업들
        for task in self.active_tasks.values():
            current_duration = (datetime.now() - task.start_time).total_seconds()
            summaries.append({
                "task_id": task.task_id,
                "task_type": task.task_type,
                "status": task.status,
                "start_time": task.start_time.isoformat(),
                "current_duration": current_duration,
                "items_processed": task.items_processed,
                "items_success": task.items_success,
                "items_failed": task.items_failed,
                "error_count": task.error_count,
                "retry_count": task.retry_count
            })
        
        # 완료된 작업들
        for task in self.completed_tasks:
            summaries.append({
                "task_id": task.task_id,
                "task_type": task.task_type,
                "status": task.status,
                "start_time": task.start_time.isoformat(),
                "end_time": task.end_time.isoformat() if task.end_time else None,
                "duration": task.duration,
                "items_processed": task.items_processed,
                "items_success": task.items_success,
                "items_failed": task.items_failed,
                "error_count": task.error_count,
                "retry_count": task.retry_count
            })
        
        return summaries
    
    def _calculate_average_task_duration(self) -> float:
        """평균 작업 시간 계산"""
        completed_tasks = [t for t in self.completed_tasks if t.duration is not None]
        if not completed_tasks:
            return 0.0
        
        total_duration = sum(t.duration for t in completed_tasks)
        return total_duration / len(completed_tasks)
    
    def print_performance_report(self):
        """성능 보고서 출력"""
        if not self.current_session:
            logger.warning("출력할 성능 데이터가 없습니다.")
            return
        
        summary = self.get_session_summary()
        
        print("\n" + "="*60)
        print("TIKTOK SCRAPER 성능 보고서")
        print("="*60)
        print(f"세션 ID: {summary['session_id']}")
        print(f"세션 이름: {summary['session_name']}")
        print(f"상태: {summary['status']}")
        print(f"시작 시간: {summary['start_time']}")
        print(f"현재 소요 시간: {summary['current_duration']:.2f}초")
        print("-"*60)
        print(f"활성 작업: {summary['active_tasks']}개")
        print(f"완료된 작업: {summary['completed_tasks']}개")
        print(f"실패한 작업: {summary['failed_tasks']}개")
        print(f"총 수집 아이템: {summary['total_items_collected']}개")
        print(f"총 오류: {summary['total_errors']}개")
        print(f"평균 작업 시간: {summary['average_task_duration']:.2f}초")
        print("="*60)
        
        # 상세 작업 목록
        if self.completed_tasks:
            print("\n완료된 작업 목록:")
            print("-"*60)
            for task in self.completed_tasks[-10:]:  # 최근 10개만
                print(f"{task.task_id} ({task.task_type}): {task.status} - {task.duration:.2f}초")
                print(f"  성공: {task.items_success}, 실패: {task.items_failed}, 오류: {task.error_count}")
        
        if self.active_tasks:
            print("\n활성 작업 목록:")
            print("-"*60)
            for task in self.active_tasks.values():
                current_duration = (datetime.now() - task.start_time).total_seconds()
                print(f"{task.task_id} ({task.task_type}): {task.status} - {current_duration:.2f}초")
                print(f"  처리: {task.items_processed}, 성공: {task.items_success}, 실패: {task.items_failed}")
        
        print("="*60) 