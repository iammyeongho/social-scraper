"""
API 설정
"""
from typing import Optional, List
from pydantic import BaseModel, Field
from .base import BaseConfig

class ApiConfig(BaseConfig):
    """API 설정"""
    
    # 인플루언서 API 설정
    influencer_api_url: str = Field(
        default="https://api.example.com/influencers",
        description="인플루언서 API URL"
    )
    influencer_api_key: str = Field(default="", description="인플루언서 API 키")
    
    # 테스트용 인플루언서 목록 (API 연동 전 사용)
    test_influencer_ids: List[str] = Field(
        default=[
            "at_chaeunwoo", 
        ],
        description="테스트용 인플루언서 ID 목록"
    )
    
    # API 사용 여부 (false면 테스트 목록 사용)
    use_api: bool = Field(default=False, description="API 사용 여부")
    
    # 결과 전송 API 설정
    result_api_url: str = Field(
        default="https://api.example.com/results",
        description="결과 전송 API URL"
    )
    result_api_key: str = Field(default="", description="결과 전송 API 키")
    
    # HTTP 설정
    timeout: int = Field(default=30, description="API 요청 타임아웃(초)")
    max_retries: int = Field(default=3, description="API 요청 최대 재시도 횟수")
    retry_delay: float = Field(default=2.0, description="API 재시도 간 지연 시간(초)")
    
    # 헤더 설정
    user_agent: str = Field(
        default="TikTok-Scraper/1.0.0",
        description="User-Agent 헤더"
    )
    
    @property
    def headers(self) -> dict:
        """API 요청 헤더 반환"""
        return {
            "User-Agent": self.user_agent,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
    @property
    def influencer_headers(self) -> dict:
        """인플루언서 API 헤더 반환"""
        headers = self.headers.copy()
        if self.influencer_api_key:
            headers["Authorization"] = f"Bearer {self.influencer_api_key}"
        return headers
    
    @property
    def result_headers(self) -> dict:
        """결과 전송 API 헤더 반환"""
        headers = self.headers.copy()
        if self.result_api_key:
            headers["Authorization"] = f"Bearer {self.result_api_key}"
        return headers 