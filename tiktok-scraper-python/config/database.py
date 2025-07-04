"""
데이터베이스 설정
"""
from typing import Optional
from pydantic import BaseModel, Field
from .base import BaseConfig

class DatabaseConfig(BaseConfig):
    """PostgreSQL 데이터베이스 설정"""
    
    # 데이터베이스 연결 설정
    host: str = Field(default="localhost", description="데이터베이스 호스트")
    port: int = Field(default=5432, description="데이터베이스 포트")
    database: str = Field(default="tiktok_scraper", description="데이터베이스 이름")
    username: str = Field(default="postgres", description="데이터베이스 사용자명")
    password: str = Field(default="", description="데이터베이스 비밀번호")
    
    # 연결 풀 설정
    min_connections: int = Field(default=1, description="최소 연결 수")
    max_connections: int = Field(default=10, description="최대 연결 수")
    connection_timeout: int = Field(default=30, description="연결 타임아웃(초)")
    
    # 성능 설정
    statement_timeout: int = Field(default=30000, description="쿼리 타임아웃(밀리초)")
    idle_in_transaction_timeout: int = Field(default=30000, description="트랜잭션 타임아웃(밀리초)")
    
    @property
    def connection_string(self) -> str:
        """데이터베이스 연결 문자열 반환"""
        if self.password:
            return f"postgresql://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}"
        else:
            return f"postgresql://{self.username}@{self.host}:{self.port}/{self.database}"
    
    @property
    def async_connection_string(self) -> str:
        """비동기 데이터베이스 연결 문자열 반환"""
        if self.password:
            return f"postgresql+asyncpg://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}"
        else:
            return f"postgresql+asyncpg://{self.username}@{self.host}:{self.port}/{self.database}" 