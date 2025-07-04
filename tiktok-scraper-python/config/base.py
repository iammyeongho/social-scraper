"""
기본 설정 클래스
"""
import os
from typing import Optional
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv()

class BaseConfig(BaseModel):
    """기본 설정 클래스"""
    
    # 로깅 설정
    log_level: str = Field(default="INFO", description="로그 레벨")
    log_file: str = Field(default="logs/tiktok_scraper.log", description="로그 파일 경로")
    
    # 성능 설정
    max_concurrent_tasks: int = Field(default=3, description="최대 동시 작업 수")
    request_delay: float = Field(default=2.0, description="요청 간 지연 시간(초)")
    timeout: int = Field(default=30, description="요청 타임아웃(초)")
    
    # 재시도 설정
    max_retries: int = Field(default=3, description="최대 재시도 횟수")
    retry_delay: float = Field(default=5.0, description="재시도 간 지연 시간(초)")
    
    # 데이터 설정
    batch_size: int = Field(default=100, description="배치 처리 크기")
    max_items_per_influencer: int = Field(default=1000, description="인플루언서당 최대 수집 아이템 수")
    
    class Config:
        env_file = ".env"
        case_sensitive = False 