"""
TikTok 게시물 스크래퍼 - 완전 재작성 버전
게시물 상세 정보와 댓글 스크래핑
"""
import re
import json
from typing import Dict, Any, Optional, List
from datetime import datetime
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from .base_scraper import BaseScraper

class TikTokPostScraper(BaseScraper):
    """TikTok 게시물 스크래퍼 - 완전 재작성"""
    
    def __init__(self, db_service=None, performance_tracker=None, config=None):
        super().__init__(db_service, performance_tracker, config)
        
        # TikTok 게시물 관련 선택자들 (2024년 최신)
        self.selectors = {
            # 게시물 링크 찾기
            "post_links": "a[href*='/video/']",
            "post_container": "[data-e2e='user-post-item']",
            "alt_post_container": "[data-e2e='user-post-item-list'] > div",
            
            # 게시물 상세 정보
            "post_content": "[data-e2e='user-post-item-desc']",
            "post_author": "[data-e2e='user-post-item-user-info']",
            "post_time": "[data-e2e='user-post-item-time']",
            
            # 게시물 통계
            "like_count": "[data-e2e='like-count']",
            "comment_count": "[data-e2e='comment-count']",
            "share_count": "[data-e2e='share-count']",
            "play_count": "[data-e2e='play-count']",
            
            # 댓글 관련
            "comment_container": "[data-e2e='comment-level-1']",
            "comment_text": "[data-e2e='comment-level-1'] [data-e2e='comment-text']",
            "comment_author": "[data-e2e='comment-level-1'] [data-e2e='comment-username']",
            "comment_time": "[data-e2e='comment-level-1'] [data-e2e='comment-time']",
            "comment_likes": "[data-e2e='comment-level-1'] [data-e2e='comment-like-count']",
            
            # 댓글 더보기
            "load_more_comments": "[data-e2e='comment-load-more']",
            "comment_input": "[data-e2e='comment-input']"
        }
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def scrape_profile_posts(self, influencer_id: str, max_posts: int = 10) -> List[Dict[str, Any]]:
        """인플루언서의 게시물 목록 스크래핑"""
        try:
            logger.info(f"게시물 목록 스크래핑 시작: {influencer_id}")
            
            # TikTok 프로필 URL
            profile_url = f"{self.config.tiktok.base_url}/@{influencer_id}"
            
            # 페이지 이동
            if not await self._navigate_to_page(profile_url):
                logger.error(f"프로필 페이지 로드 실패: {influencer_id}")
                return []
            
            # 콘텐츠 로드 대기
            await self._wait_for_content_load()
            
            # 오류 페이지 처리
            if await self._handle_error_page():
                logger.info("오류 페이지 처리 완료")
            
            # 캡차 및 속도 제한 확인
            if await self._handle_captcha():
                logger.warning(f"캡차 감지됨: {influencer_id}")
                return []
            
            if await self._handle_rate_limit():
                logger.warning(f"속도 제한 감지됨: {influencer_id}")
                return []
            
            # 사용자 행동 시뮬레이션
            await self._simulate_human_behavior()
            
            # 페이지 스크롤하여 더 많은 게시물 로드
            scroll_count = await self._scroll_page(5)
            logger.info(f"페이지 스크롤 완료: {scroll_count}회")
            
            # 추가 사용자 행동 시뮬레이션
            await self._simulate_human_behavior()
            
            # 게시물 링크 추출
            post_links = await self._extract_post_links(influencer_id, max_posts)
            
            if not post_links:
                logger.warning(f"게시물 링크를 찾을 수 없음: {influencer_id}")
                return []
            
            logger.info(f"발견된 게시물 링크: {len(post_links)}개")
            
            # 각 게시물 상세 정보 스크래핑
            posts_data = []
            for i, post_link in enumerate(post_links[:max_posts]):
                try:
                    logger.info(f"게시물 {i+1}/{len(post_links)} 스크래핑 중: {post_link}")
                    
                    post_data = await self._scrape_single_post(post_link, influencer_id, i)
                    if post_data:
                        posts_data.append(post_data)
                        logger.info(f"게시물 {i+1} 스크래핑 완료")
                    
                    # 요청 간 지연
                    await self._random_delay(2, 4)
                    
                except Exception as e:
                    logger.error(f"게시물 스크래핑 실패: {post_link} - {e}")
                    continue
            
            logger.info(f"게시물 스크래핑 완료: {influencer_id} - {len(posts_data)}개")
            return posts_data
            
        except Exception as e:
            logger.error(f"게시물 목록 스크래핑 실패: {influencer_id} - {e}")
            return []
    
    async def _extract_post_links(self, influencer_id: str, max_posts: int) -> List[str]:
        """게시물 링크 추출 - 개선된 버전"""
        try:
            # 페이지의 모든 링크를 먼저 확인
            all_links = await self.page.evaluate("""
                () => {
                    const links = Array.from(document.querySelectorAll('a'));
                    return links.map(link => ({
                        href: link.href,
                        text: link.textContent?.trim(),
                        className: link.className,
                        dataset: link.dataset
                    }));
                }
            """)
            
            logger.info(f"페이지의 모든 링크: {len(all_links)}개")
            
            # 비디오 링크 필터링
            video_links = []
            for link in all_links:
                href = link.get('href', '')
                if '/video/' in href and href not in video_links:
                    video_links.append(href)
            
            logger.info(f"비디오 링크 발견: {len(video_links)}개")
            
            # 더 정교한 방법으로 게시물 링크 찾기
            if not video_links:
                # 대체 방법: 게시물 컨테이너에서 링크 찾기
                video_links = await self.page.evaluate("""
                    () => {
                        const links = [];
                        
                        // 다양한 선택자로 게시물 찾기
                        const selectors = [
                            '[data-e2e="user-post-item"] a',
                            '[data-e2e="user-post-item-list"] a',
                            '.tiktok-1qb12g8-DivItemContainer a',
                            '.tiktok-1qb12g8-DivItemContainerV2 a',
                            '[data-e2e="user-post-item-desc"] a',
                            'a[href*="/video/"]',
                            'a[href*="/@' + window.location.pathname.split('/@')[1] + '/video/"]'
                        ];
                        
                        selectors.forEach(selector => {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(el => {
                                const href = el.href;
                                if (href && href.includes('/video/') && !links.includes(href)) {
                                    links.push(href);
                                }
                            });
                        });
                        
                        return links;
                    }
                """)
                
                logger.info(f"대체 방법으로 비디오 링크 발견: {len(video_links)}개")
            
            # 여전히 링크를 찾지 못한 경우, 페이지 구조 분석
            if not video_links:
                page_structure = await self.page.evaluate("""
                    () => {
                        const structure = {
                            bodyText: document.body.innerText.substring(0, 1000),
                            links: Array.from(document.querySelectorAll('a')).map(a => a.href).slice(0, 20),
                            containers: document.querySelectorAll('[data-e2e*="post"], [data-e2e*="video"], [class*="post"], [class*="video"]').length,
                            hasVideoElements: !!document.querySelector('video'),
                            hasPostElements: !!document.querySelector('[data-e2e*="post"]')
                        };
                        return structure;
                    }
                """)
                
                logger.info(f"페이지 구조 분석: {page_structure}")
                
                # 게시물이 로드되지 않았을 수 있으므로 추가 스크롤
                await self._scroll_page(3)
                await self._random_delay(2, 4)
                
                # 다시 시도
                video_links = await self.page.evaluate("""
                    () => {
                        const links = [];
                        const allLinks = document.querySelectorAll('a[href*="/video/"]');
                        allLinks.forEach(link => {
                            if (link.href && !links.includes(link.href)) {
                                links.push(link.href);
                            }
                        });
                        return links;
                    }
                """)
                
                logger.info(f"추가 스크롤 후 비디오 링크: {len(video_links)}개")
            
            # 중복 제거 및 최대 개수 제한
            unique_links = list(set(video_links))[:max_posts]
            
            logger.info(f"최종 추출된 게시물 링크: {len(unique_links)}개")
            for i, link in enumerate(unique_links):
                logger.info(f"  {i+1}. {link}")
            
            return unique_links
            
        except Exception as e:
            logger.error(f"게시물 링크 추출 실패: {e}")
            return []
    
    async def _scrape_single_post(self, post_url: str, influencer_id: str, index: int) -> Optional[Dict[str, Any]]:
        """단일 게시물 상세 정보 스크래핑"""
        try:
            logger.info(f"게시물 상세 스크래핑: {post_url}")
            
            # 게시물 페이지로 이동
            if not await self._navigate_to_page(post_url):
                logger.error(f"게시물 페이지 로드 실패: {post_url}")
                return None
            
            # 캡차 확인
            if await self._handle_captcha():
                logger.warning("캡차 감지됨")
                return None
            
            # 게시물 데이터 초기화
            post_data = {
                "influencer_id": influencer_id,
                "post_url": post_url,
                "post_index": index,
                "scraped_at": datetime.now().isoformat()
            }
            
            # 게시물 ID 추출
            post_id = self._extract_post_id(post_url)
            post_data["post_id"] = post_id
            
            # 게시물 기본 정보 추출
            await self._extract_post_basic_info(post_data)
            
            # 게시물 통계 정보 추출
            await self._extract_post_statistics(post_data)
            
            # 댓글 정보 추출
            comments = await self._extract_comments(post_data)
            post_data["comments"] = comments
            
            # 댓글 통계
            post_data["comment_count"] = len(comments)
            
            logger.info(f"게시물 상세 스크래핑 완료: {post_id}")
            return post_data
            
        except Exception as e:
            logger.error(f"단일 게시물 스크래핑 실패: {post_url} - {e}")
            return None
    
    def _extract_post_id(self, post_url: str) -> str:
        """게시물 ID 추출"""
        try:
            # URL에서 게시물 ID 추출
            match = re.search(r'/video/(\d+)', post_url)
            if match:
                return match.group(1)
            
            # 대체 방법
            parts = post_url.split('/')
            for part in parts:
                if part.isdigit() and len(part) > 10:
                    return part
            
            return "unknown"
            
        except Exception as e:
            logger.error(f"게시물 ID 추출 실패: {post_url} - {e}")
            return "unknown"
    
    async def _extract_post_basic_info(self, post_data: Dict[str, Any]):
        """게시물 기본 정보 추출"""
        try:
            # 게시물 내용
            content = await self._get_text_content(self.selectors["post_content"])
            post_data["content"] = content.strip() if content else ""
            
            # 게시물 작성자
            author = await self._get_text_content(self.selectors["post_author"])
            post_data["author"] = author.strip() if author else ""
            
            # 게시물 시간
            post_time = await self._get_text_content(self.selectors["post_time"])
            post_data["post_time"] = post_time.strip() if post_time else ""
            
            # 해시태그 추출
            hashtags = re.findall(r'#\w+', post_data.get("content", ""))
            post_data["hashtags"] = hashtags
            
            # 멘션 추출
            mentions = re.findall(r'@\w+', post_data.get("content", ""))
            post_data["mentions"] = mentions
            
        except Exception as e:
            logger.error(f"게시물 기본 정보 추출 실패: {e}")
    
    async def _extract_post_statistics(self, post_data: Dict[str, Any]):
        """게시물 통계 정보 추출"""
        try:
            # 좋아요 수
            likes_text = await self._get_text_content(self.selectors["like_count"])
            post_data["hearts"] = self._parse_count(likes_text)
            
            # 댓글 수
            comments_text = await self._get_text_content(self.selectors["comment_count"])
            post_data["comment_count_raw"] = self._parse_count(comments_text)
            
            # 공유 수
            shares_text = await self._get_text_content(self.selectors["share_count"])
            post_data["shares"] = self._parse_count(shares_text)
            
            # 조회수
            views_text = await self._get_text_content(self.selectors["play_count"])
            post_data["views"] = self._parse_count(views_text)
            
            # 참여율 계산
            if post_data.get("views", 0) > 0:
                engagement_rate = (
                    (post_data.get("hearts", 0) + post_data.get("comment_count_raw", 0) + post_data.get("shares", 0)) 
                    / post_data.get("views", 1) * 100
                )
                post_data["engagement_rate"] = round(engagement_rate, 2)
            else:
                post_data["engagement_rate"] = 0.0
            
        except Exception as e:
            logger.error(f"게시물 통계 정보 추출 실패: {e}")
    
    async def _extract_comments(self, post_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """댓글 정보 추출"""
        try:
            logger.info("댓글 추출 시작...")
            
            # 댓글 섹션이 로드될 때까지 대기
            try:
                await self.page.wait_for_selector(self.selectors["comment_container"], timeout=10000)
            except:
                logger.warning("댓글 섹션을 찾을 수 없음")
                return []
            
            # 댓글 더 로드 (스크롤)
            await self._load_more_comments()
            
            # 댓글 컨테이너들 찾기
            comment_containers = await self.page.query_selector_all(self.selectors["comment_container"])
            
            if not comment_containers:
                logger.warning("댓글을 찾을 수 없음")
                return []
            
            logger.info(f"발견된 댓글: {len(comment_containers)}개")
            
            comments = []
            for i, container in enumerate(comment_containers[:50]):  # 최대 50개 댓글
                try:
                    comment_data = await self._extract_single_comment(container, i)
                    if comment_data:
                        comments.append(comment_data)
                except Exception as e:
                    logger.debug(f"댓글 {i} 추출 실패: {e}")
                    continue
            
            logger.info(f"댓글 추출 완료: {len(comments)}개")
            return comments
            
        except Exception as e:
            logger.error(f"댓글 추출 실패: {e}")
            return []
    
    async def _load_more_comments(self):
        """더 많은 댓글 로드"""
        try:
            # 댓글 섹션 스크롤
            await self.page.evaluate("""
                () => {
                    const commentSection = document.querySelector('[data-e2e="comment-level-1"]');
                    if (commentSection) {
                        commentSection.scrollIntoView();
                    }
                }
            """)
            
            await self._random_delay(1, 2)
            
            # 더보기 버튼 클릭 시도
            load_more_button = await self.page.query_selector(self.selectors["load_more_comments"])
            if load_more_button:
                await load_more_button.click()
                await self._random_delay(2, 3)
            
            # 추가 스크롤
            for _ in range(3):
                await self.page.evaluate("window.scrollBy(0, 500)")
                await self._random_delay(1, 2)
                
        except Exception as e:
            logger.debug(f"댓글 더 로드 실패: {e}")
    
    async def _extract_single_comment(self, container, index: int) -> Optional[Dict[str, Any]]:
        """단일 댓글 정보 추출"""
        try:
            comment_data = {
                "comment_index": index,
                "scraped_at": datetime.now().isoformat()
            }
            
            # 댓글 텍스트
            text_element = await container.query_selector(self.selectors["comment_text"])
            if text_element:
                text = await text_element.text_content()
                comment_data["text"] = text.strip() if text else ""
            
            # 댓글 작성자
            author_element = await container.query_selector(self.selectors["comment_author"])
            if author_element:
                author = await author_element.text_content()
                comment_data["author"] = author.strip() if author else ""
            
            # 댓글 시간
            time_element = await container.query_selector(self.selectors["comment_time"])
            if time_element:
                time_text = await time_element.text_content()
                comment_data["time"] = time_text.strip() if time_text else ""
            
            # 댓글 좋아요 수
            likes_element = await container.query_selector(self.selectors["comment_likes"])
            if likes_element:
                likes_text = await likes_element.text_content()
                comment_data["likes"] = self._parse_count(likes_text)
            else:
                comment_data["likes"] = 0
            
            # 댓글 ID 생성
            comment_data["comment_id"] = f"{comment_data.get('author', 'unknown')}_{index}"
            
            return comment_data
            
        except Exception as e:
            logger.debug(f"단일 댓글 추출 실패: {e}")
            return None
    
    def _parse_count(self, text: str) -> int:
        """숫자 텍스트를 정수로 변환"""
        if not text:
            return 0
        
        try:
            # 쉼표 제거
            text = text.replace(',', '')
            
            # K, M, B 단위 처리
            text_lower = text.lower().strip()
            if 'k' in text_lower:
                number = float(re.findall(r'[\d.]+', text_lower)[0])
                return int(number * 1000)
            elif 'm' in text_lower:
                number = float(re.findall(r'[\d.]+', text_lower)[0])
                return int(number * 1000000)
            elif 'b' in text_lower:
                number = float(re.findall(r'[\d.]+', text_lower)[0])
                return int(number * 1000000000)
            
            # 일반 숫자
            numbers = re.findall(r'[\d]+', text)
            if numbers:
                return int(numbers[0])
            
            return 0
            
        except Exception as e:
            logger.error(f"숫자 파싱 실패: {text} - {e}")
            return 0
    
    async def scrape_multiple_posts(self, influencer_ids: list, max_posts_per_user: int = 5) -> Dict[str, List[Dict[str, Any]]]:
        """여러 인플루언서의 게시물 스크래핑"""
        all_posts = {}
        
        for influencer_id in influencer_ids:
            try:
                logger.info(f"인플루언서 게시물 스크래핑: {influencer_id}")
                
                posts = await self.scrape_profile_posts(influencer_id, max_posts_per_user)
                if posts:
                    all_posts[influencer_id] = posts
                
                # 요청 간 지연
                await self._random_delay(5, 8)
                
            except Exception as e:
                logger.error(f"인플루언서 게시물 스크래핑 실패: {influencer_id} - {e}")
                continue
        
        return all_posts 