"""
TikTok 스크래핑 설정
"""
from typing import Optional, List
from pydantic import BaseModel, Field
from .base import BaseConfig

class TikTokConfig(BaseConfig):
    """TikTok 스크래핑 설정"""
    
    # TikTok URL 설정
    base_url: str = Field(default="https://www.tiktok.com", description="TikTok 기본 URL")
    api_url: str = Field(default="https://api.tiktok.com", description="TikTok API URL")
    
    # 스크래핑 설정
    headless: bool = Field(default=False, description="헤드리스 모드 사용 여부")
    slow_mo: int = Field(default=100, description="Playwright 슬로우 모션(밀리초)")
    viewport_width: int = Field(default=1920, description="뷰포트 너비")
    viewport_height: int = Field(default=1080, description="뷰포트 높이")
    
    # 스크롤 설정
    scroll_pause_time: float = Field(default=2.0, description="스크롤 후 대기 시간(초)")
    max_scroll_attempts: int = Field(default=10, description="최대 스크롤 시도 횟수")
    scroll_distance: int = Field(default=1000, description="한 번에 스크롤할 픽셀 수")
    
    # 데이터 수집 설정
    max_posts_per_influencer: int = Field(default=100, description="인플루언서당 최대 게시물 수")
    max_followers_per_influencer: int = Field(default=500, description="인플루언서당 최대 팔로워 수")
    max_comments_per_post: int = Field(default=200, description="게시물당 최대 댓글 수")
    
    # 대기 시간 설정
    page_load_timeout: int = Field(default=30, description="페이지 로드 타임아웃(초)")
    element_wait_timeout: int = Field(default=10, description="요소 대기 타임아웃(초)")
    navigation_timeout: int = Field(default=30, description="네비게이션 타임아웃(초)")
    
    # 재시도 설정
    max_retries_on_failure: int = Field(default=3, description="실패 시 최대 재시도 횟수")
    retry_delay_on_failure: float = Field(default=5.0, description="실패 시 재시도 지연 시간(초)")
    
    # User-Agent 설정
    user_agents: List[str] = Field(
        default=[
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ],
        description="사용할 User-Agent 목록"
    )
    
    # 쿠키 및 세션 설정
    use_cookies: bool = Field(default=False, description="쿠키 사용 여부")
    cookie_file: str = Field(default="cookies.json", description="쿠키 파일 경로")
    
    # 프록시 설정
    use_proxy: bool = Field(default=False, description="프록시 사용 여부")
    proxy_server: str = Field(default="", description="프록시 서버 주소")
    
    # 스크린샷 설정
    take_screenshots: bool = Field(default=False, description="스크린샷 촬영 여부")
    screenshot_dir: str = Field(default="screenshots", description="스크린샷 저장 디렉토리")
    
    @property
    def browser_args(self) -> List[str]:
        """브라우저 시작 인수 반환"""
        args = [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
            "--disable-blink-features=AutomationControlled",
            "--disable-web-security",
            "--disable-features=VizDisplayCompositor"
        ]
        
        if self.headless:
            args.append("--headless")
            
        return args 