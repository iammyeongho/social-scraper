"""
TikTok 스크래핑 기본 클래스
"""
import os
import asyncio
import random
import time
from typing import Optional, Dict, Any
from datetime import datetime
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from playwright_stealth.stealth import Stealth

from config.settings import settings

class BaseScraper:
    """TikTok 스크래핑 기본 클래스"""
    
    def __init__(self, db_service=None, performance_tracker=None, config=None):
        self.db_service = db_service
        self.performance_tracker = performance_tracker
        self.config = config or settings
        
        # Playwright 관련
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        
        # 사용자 에이전트 목록
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15"
        ]
        
        # 현재 사용자 에이전트
        self.current_user_agent = random.choice(self.user_agents)
        
        # 스크래핑 통계
        self.stats = {
            "requests_made": 0,
            "captchas_encountered": 0,
            "rate_limits_encountered": 0,
            "errors": 0
        }
    
    async def initialize(self):
        """스크래퍼 초기화"""
        try:
            logger.info(f"{self.__class__.__name__} 초기화 시작")
            
            # Playwright 시작
            self.playwright = await async_playwright().start()
            
            # Chrome 프로필 경로
            user_data_dir = os.path.abspath("chrome-profile")
            
            # 실제 Chrome 브라우저 경로 찾기
            chrome_paths = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"C:\Users\{}\AppData\Local\Google\Chrome\Application\chrome.exe".format(os.getenv('USERNAME', '')),
            ]
            
            executable_path = None
            for path in chrome_paths:
                if os.path.exists(path):
                    executable_path = path
                    break
            
            if executable_path:
                logger.info(f"실제 Chrome 브라우저 사용: {executable_path}")
            else:
                logger.warning("실제 Chrome을 찾을 수 없어 Playwright Chromium 사용")
            
            # 원격 디버깅 방식으로 Chrome 연결
            try:
                # 기존 Chrome 인스턴스에 연결 시도
                self.context = await self.playwright.chromium.connect_over_cdp("http://localhost:9222")
                logger.info("기존 Chrome 인스턴스에 연결 성공")
            except Exception as e:
                logger.warning(f"기존 Chrome 연결 실패: {e}")
                logger.info("새로운 Chrome 인스턴스를 시작합니다...")
                
                # 새로운 Chrome 인스턴스 시작
                import subprocess
                chrome_cmd = [
                    executable_path or "chrome",
                    "--remote-debugging-port=9222",
                    f"--user-data-dir={user_data_dir}",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-web-security",
                    "--disable-features=VizDisplayCompositor",
                    "--disable-extensions",
                    "--disable-plugins",
                    "--disable-images",
                    "--disable-javascript",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding",
                    "--disable-features=TranslateUI",
                    "--disable-ipc-flooding-protection",
                    "--disable-hang-monitor",
                    "--disable-prompt-on-repost",
                    "--disable-domain-reliability",
                    "--disable-component-extensions-with-background-pages",
                    "--disable-default-apps",
                    "--disable-sync",
                    "--disable-translate",
                    "--hide-scrollbars",
                    "--mute-audio",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-accelerated-2d-canvas",
                    "--no-zygote",
                    "--disable-gpu",
                    "--disable-background-networking",
                    "--disable-background-timer-throttling",
                    "--disable-client-side-phishing-detection",
                    "--disable-component-update",
                    "--disable-default-apps",
                    "--disable-extensions",
                    "--disable-features=TranslateUI",
                    "--disable-ipc-flooding-protection",
                    "--disable-popup-blocking",
                    "--disable-prompt-on-repost",
                    "--disable-renderer-backgrounding",
                    "--disable-sync",
                    "--disable-translate",
                    "--metrics-recording-only",
                    "--no-first-run",
                    "--safebrowsing-disable-auto-update",
                    "--enable-automation",
                    "--password-store=basic",
                    "--use-mock-keychain",
                    "--no-service-autorun",
                    "--export-tagged-pdf",
                    "--disable-search-engine-choice-screen"
                ]
                
                if not self.config.tiktok.headless:
                    chrome_cmd.append("--start-maximized")
                
                # Chrome 프로세스 시작
                subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                # 잠시 대기 후 연결
                await asyncio.sleep(5)
                
                try:
                    self.context = await self.playwright.chromium.connect_over_cdp("http://localhost:9222")
                    logger.info("새로운 Chrome 인스턴스에 연결 성공")
                except Exception as connect_error:
                    logger.error(f"Chrome 연결 실패: {connect_error}")
                    raise
            
            # 페이지 생성
            self.page = await self.context.new_page()
            
            # 스텔스 모드 적용
            stealth = Stealth()
            await stealth.apply_stealth_async(self.page)
            
            # 기본 타임아웃 설정
            self.page.set_default_timeout(30000)
            
            # 뷰포트 설정
            await self.page.set_viewport_size({
                "width": self.config.tiktok.viewport_width,
                "height": self.config.tiktok.viewport_height
            })
            
            # 사용자 에이전트 설정
            await self.page.set_extra_http_headers({
                "User-Agent": self.current_user_agent
            })
            
            # 자동화 탐지 우회 스크립트 실행
            await self.page.add_init_script("""
                // 자동화 탐지 우회
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
                
                // Chrome 런타임 우회
                if (window.chrome) {
                    window.chrome.runtime = undefined;
                }
                
                // Permissions API 우회
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                
                // 플러그인 배열 수정
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                
                // 언어 배열 수정
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['ko-KR', 'ko', 'en-US', 'en'],
                });
                
                // 더 강력한 자동화 탐지 우회
                delete Object.getPrototypeOf(navigator).webdriver;
                
                // Chrome 객체 완전 제거
                Object.defineProperty(window, 'chrome', {
                    get: () => undefined,
                });
                
                // 자동화 관련 속성 제거
                Object.defineProperty(navigator, 'automation', {
                    get: () => undefined,
                });
                
                // WebDriver 속성 완전 제거
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                    configurable: true
                });
                
                // 자동화 탐지 함수 무력화
                const originalGetPropertyDescriptor = Object.getOwnPropertyDescriptor;
                Object.getOwnPropertyDescriptor = function(obj, prop) {
                    if (prop === 'webdriver' && obj === navigator) {
                        return undefined;
                    }
                    return originalGetPropertyDescriptor.call(this, obj, prop);
                };
                
                // 자동화 탐지 스크립트 무력화
                const originalDefineProperty = Object.defineProperty;
                Object.defineProperty = function(obj, prop, descriptor) {
                    if (prop === 'webdriver' && obj === navigator) {
                        return obj;
                    }
                    return originalDefineProperty.call(this, obj, prop, descriptor);
                };
                
                // 자동화 탐지 이벤트 무력화
                const originalAddEventListener = EventTarget.prototype.addEventListener;
                EventTarget.prototype.addEventListener = function(type, listener, options) {
                    if (type === 'webdriver' || type === 'automation') {
                        return;
                    }
                    return originalAddEventListener.call(this, type, listener, options);
                };
                
                // 자동화 탐지 타이머 무력화
                const originalSetTimeout = window.setTimeout;
                window.setTimeout = function(fn, delay, ...args) {
                    if (typeof fn === 'string' && fn.includes('webdriver')) {
                        return 0;
                    }
                    return originalSetTimeout.call(this, fn, delay, ...args);
                };
                
                // 자동화 탐지 인터벌 무력화
                const originalSetInterval = window.setInterval;
                window.setInterval = function(fn, delay, ...args) {
                    if (typeof fn === 'string' && fn.includes('webdriver')) {
                        return 0;
                    }
                    return originalSetInterval.call(this, fn, delay, ...args);
                };
            """)
            
            logger.info(f"{self.__class__.__name__} 초기화 완료")
            
        except Exception as e:
            logger.error(f"{self.__class__.__name__} 초기화 실패: {e}")
            raise
    
    async def _navigate_to_page(self, url: str, wait_for_selector: str = None, timeout: int = 30000) -> bool:
        """페이지 네비게이션"""
        try:
            logger.debug(f"페이지 이동: {url}")
            
            # 페이지 이동
            await self.page.goto(url, wait_until="domcontentloaded", timeout=timeout)
            
            # 랜덤 지연
            await self._random_delay(2, 5)
            
            # 특정 요소 대기 (있는 경우)
            if wait_for_selector:
                try:
                    await self.page.wait_for_selector(wait_for_selector, timeout=10000)
                except Exception as e:
                    logger.warning(f"선택자 대기 실패: {wait_for_selector} - {e}")
            
            # 페이지 로드 완료 대기
            await self.page.wait_for_load_state("networkidle", timeout=10000)
            
            self.stats["requests_made"] += 1
            return True
            
        except Exception as e:
            logger.error(f"페이지 네비게이션 실패: {url} - {e}")
            return False
    
    async def _handle_captcha(self) -> bool:
        """캡차 처리"""
        try:
            # 캡차 감지
            captcha_selectors = [
                "iframe[src*='captcha']",
                ".captcha",
                "#captcha",
                "[class*='captcha']",
                "iframe[src*='recaptcha']"
            ]
            
            for selector in captcha_selectors:
                captcha_element = await self.page.query_selector(selector)
                if captcha_element:
                    logger.warning("캡차 감지됨 - 수동 개입 필요")
                    self.stats["captchas_encountered"] += 1
                    
                    # 사용자에게 캡차 해결 요청
                    print("\n" + "="*50)
                    print("🚨 캡차가 감지되었습니다!")
                    print("브라우저에서 캡차를 해결한 후 Enter를 눌러주세요...")
                    print("="*50)
                    
                    # 사용자 입력 대기
                    input()
                    
                    # 페이지 새로고침
                    await self.page.reload()
                    await self._random_delay(3, 6)
                    
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"캡차 처리 실패: {e}")
            return False
    
    async def _handle_rate_limit(self) -> bool:
        """속도 제한 처리"""
        try:
            # 속도 제한 감지
            rate_limit_indicators = [
                "Too many requests",
                "Rate limit exceeded",
                "Please wait",
                "Try again later",
                "Access denied"
            ]
            
            page_text = await self.page.evaluate("() => document.body.innerText")
            
            for indicator in rate_limit_indicators:
                if indicator.lower() in page_text.lower():
                    logger.warning(f"속도 제한 감지됨: {indicator}")
                    self.stats["rate_limits_encountered"] += 1
                    
                    # 긴 대기 시간
                    wait_time = random.randint(30, 60)
                    logger.info(f"{wait_time}초 대기 중...")
                    await asyncio.sleep(wait_time)
                    
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"속도 제한 처리 실패: {e}")
            return False
    
    async def _get_text_content(self, selector: str) -> str:
        """텍스트 내용 추출"""
        try:
            element = await self.page.query_selector(selector)
            if element:
                text = await element.text_content()
                return text.strip() if text else ""
            return ""
        except Exception as e:
            logger.debug(f"텍스트 추출 실패: {selector} - {e}")
            return ""
    
    async def _get_attribute(self, selector: str, attribute: str) -> str:
        """속성 값 추출"""
        try:
            element = await self.page.query_selector(selector)
            if element:
                value = await element.get_attribute(attribute)
                return value if value else ""
            return ""
        except Exception as e:
            logger.debug(f"속성 추출 실패: {selector} - {e}")
            return ""
    
    async def _scroll_page(self, scroll_count: int = 3) -> int:
        """페이지 스크롤"""
        try:
            for i in range(scroll_count):
                await self.page.evaluate("window.scrollBy(0, window.innerHeight)")
                await self._random_delay(1, 3)
            return scroll_count
        except Exception as e:
            logger.error(f"페이지 스크롤 실패: {e}")
            return 0
    
    async def _random_delay(self, min_seconds: float = 1.0, max_seconds: float = 3.0):
        """랜덤 지연"""
        delay = random.uniform(min_seconds, max_seconds)
        await asyncio.sleep(delay)
    
    async def _get_random_user_agent(self) -> str:
        """랜덤 사용자 에이전트 반환"""
        return random.choice(self.user_agents)
    
    async def cleanup(self):
        """리소스 정리"""
        try:
            logger.info(f"{self.__class__.__name__} 정리 시작")
            
            if self.page:
                await self.page.close()
            
            if self.context:
                await self.context.close()
            
            if self.browser:
                await self.browser.close()
            
            if self.playwright:
                await self.playwright.stop()
            
            logger.info(f"{self.__class__.__name__} 정리 완료")
            
        except Exception as e:
            logger.error(f"{self.__class__.__name__} 정리 실패: {e}")
    
    def __del__(self):
        """소멸자"""
        try:
            # 이벤트 루프가 실행 중인 경우에만 cleanup 호출
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self.cleanup())
        except:
            pass
    
    async def _simulate_human_behavior(self):
        """사용자 행동 시뮬레이션"""
        try:
            # 랜덤 마우스 움직임
            await self.page.mouse.move(
                random.randint(100, 800),
                random.randint(100, 600)
            )
            
            # 랜덤 스크롤
            await self.page.evaluate(f"""
                window.scrollBy(0, {random.randint(-300, 300)});
            """)
            
            # 랜덤 지연
            await self._random_delay(1, 3)
            
        except Exception as e:
            logger.debug(f"사용자 행동 시뮬레이션 실패: {e}")
    
    async def _wait_for_content_load(self, timeout: int = 30000):
        """콘텐츠 로드 대기"""
        try:
            # 네트워크 유휴 상태 대기
            await self.page.wait_for_load_state("networkidle", timeout=timeout)
            
            # 추가 대기
            await self._random_delay(2, 4)
            
            # 사용자 행동 시뮬레이션
            await self._simulate_human_behavior()
            
        except Exception as e:
            logger.warning(f"콘텐츠 로드 대기 실패: {e}")
    
    async def _handle_error_page(self) -> bool:
        """오류 페이지 처리"""
        try:
            # "문제가 발생했습니다" 메시지 확인
            error_selectors = [
                "text=문제가 발생했습니다",
                "text=죄송합니다! 나중에 다시 시도하세요",
                "text=Something went wrong",
                "text=Please try again later",
                "[data-e2e='error-message']"
            ]
            
            for selector in error_selectors:
                try:
                    error_element = await self.page.query_selector(selector)
                    if error_element:
                        logger.warning("오류 페이지 감지됨 - 새로고침 시도")
                        
                        # 페이지 새로고침
                        await self.page.reload()
                        await self._wait_for_content_load()
                        
                        # 사용자 행동 시뮬레이션
                        await self._simulate_human_behavior()
                        
                        return True
                except:
                    continue
            
            return False
            
        except Exception as e:
            logger.error(f"오류 페이지 처리 실패: {e}")
            return False 