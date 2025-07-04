"""
통합 설정 파일
"""
import os
from typing import Dict, Any
from .database import DatabaseConfig
from .api import ApiConfig
from .tiktok import TikTokConfig
from .base import BaseConfig

class Settings:
    """통합 설정 클래스"""
    
    def __init__(self):
        # 환경변수에서 설정 로드
        self.database = DatabaseConfig()
        self.api = ApiConfig()
        self.tiktok = TikTokConfig()
        self.base = BaseConfig()
    
    @property
    def all_configs(self) -> Dict[str, Any]:
        """모든 설정을 딕셔너리로 반환"""
        return {
            "database": self.database.dict(),
            "api": self.api.dict(),
            "tiktok": self.tiktok.dict(),
            "base": self.base.dict()
        }
    
    def validate(self) -> bool:
        """설정 유효성 검사"""
        try:
            # 필수 설정 검증
            if not self.database.database:
                raise ValueError("데이터베이스 이름이 설정되지 않았습니다.")
            
            if not self.database.username:
                raise ValueError("데이터베이스 사용자명이 설정되지 않았습니다.")
            
            if not self.api.influencer_api_url:
                raise ValueError("인플루언서 API URL이 설정되지 않았습니다.")
            
            return True
            
        except Exception as e:
            print(f"설정 검증 실패: {e}")
            return False
    
    def print_config(self):
        """설정 정보 출력"""
        print("=== TikTok Scraper 설정 ===")
        print(f"데이터베이스: {self.database.host}:{self.database.port}/{self.database.database}")
        print(f"API URL: {self.api.influencer_api_url}")
        print(f"TikTok URL: {self.tiktok.base_url}")
        print(f"헤드리스 모드: {self.tiktok.headless}")
        print(f"최대 동시 작업: {self.base.max_concurrent_tasks}")
        print("==========================")

# 전역 설정 인스턴스
settings = Settings() 