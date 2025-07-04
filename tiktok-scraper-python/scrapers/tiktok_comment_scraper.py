"""
TikTok 댓글 스크래퍼
"""
import re
import json
from typing import Dict, Any, Optional, List
from datetime import datetime
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from .base_scraper import BaseScraper

class TikTokCommentScraper(BaseScraper):
    """TikTok 댓글 스크래퍼"""
    
    def __init__(self, db_service=None, performance_tracker=None, config=None):
        super().__init__(db_service, performance_tracker, config)
        
        # TikTok 댓글 관련 선택자들
        self.selectors = {
            # 댓글 목록
            "comment_list": "[data-e2e='comment-list']",
            "comment_item": "[data-e2e='comment-item']",
            
            # 댓글 정보
            "comment_id": "[data-e2e='comment-item']",
            "comment_text": "[data-e2e='comment-text']",
            "comment_user": "[data-e2e='comment-user']",
            "comment_username": "[data-e2e='comment-username']",
            "comment_display_name": "[data-e2e='comment-display-name']",
            "comment_avatar": "[data-e2e='comment-avatar'] img",
            "comment_verified": "[data-e2e='comment-verified']",
            
            # 댓글 통계
            "comment_likes": "[data-e2e='comment-likes']",
            "comment_replies": "[data-e2e='comment-replies']",
            "comment_time": "[data-e2e='comment-time']",
            
            # 댓글 액션
            "comment_like_button": "[data-e2e='comment-like-button']",
            "comment_reply_button": "[data-e2e='comment-reply-button']",
            
            # 대체 선택자들
            "alt_comment_list": ".comment-list",
            "alt_comment_item": ".comment-item",
            "alt_comment_text": ".comment-text",
            "alt_comment_user": ".comment-user"
        }
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def scrape_comments(self, post_id: str) -> List[Dict[str, Any]]:
        """게시물의 댓글 목록 스크래핑"""
        try:
            logger.info(f"댓글 스크래핑 시작: {post_id}")
            
            # TikTok 게시물 URL 구성
            post_url = f"{self.config.base_url}/video/{post_id}"
            
            # 페이지 이동
            if not await self._navigate_to_page(post_url, wait_for_selector="[data-e2e='comment-item']"):
                logger.error(f"게시물 페이지 로드 실패: {post_id}")
                return []
            
            # 캡차 및 속도 제한 확인
            if await self._handle_captcha():
                logger.warning(f"캡차 감지됨: {post_id}")
                return []
            
            if await self._handle_rate_limit():
                logger.warning(f"속도 제한 감지됨: {post_id}")
                return []
            
            # 댓글 목록 수집
            comments = await self._extract_comments_list(post_id)
            
            logger.info(f"댓글 스크래핑 완료: {post_id} - {len(comments)}개")
            return comments
            
        except Exception as e:
            logger.error(f"댓글 스크래핑 실패: {post_id} - {e}")
            return []
    
    async def _extract_comments_list(self, post_id: str) -> List[Dict[str, Any]]:
        """댓글 목록 추출"""
        comments = []
        
        try:
            # 댓글 섹션으로 스크롤
            await self._scroll_to_comments_section()
            
            # 페이지 스크롤하여 더 많은 댓글 로드
            scroll_count = await self._scroll_comments_section()
            logger.debug(f"댓글 섹션 스크롤 완료: {scroll_count}회")
            
            # 댓글 아이템들 찾기
            comment_items = await self.page.query_selector_all(self.selectors["comment_item"])
            
            if not comment_items:
                # 대체 선택자 시도
                comment_items = await self.page.query_selector_all(self.selectors["alt_comment_item"])
            
            logger.debug(f"발견된 댓글 아이템: {len(comment_items)}개")
            
            # 각 댓글 처리
            for i, item in enumerate(comment_items[:self.config.max_comments_per_post]):
                try:
                    comment_data = await self._extract_single_comment(item, post_id, i)
                    if comment_data:
                        comments.append(comment_data)
                    
                    # 요청 간 지연
                    await self._random_delay(0.3, 0.8)
                    
                except Exception as e:
                    logger.error(f"개별 댓글 추출 실패: {post_id} - {i}번째 - {e}")
                    continue
            
            return comments
            
        except Exception as e:
            logger.error(f"댓글 목록 추출 실패: {post_id} - {e}")
            return comments
    
    async def _scroll_to_comments_section(self):
        """댓글 섹션으로 스크롤"""
        try:
            # 댓글 섹션 찾기
            comment_section = await self.page.query_selector(self.selectors["comment_list"])
            if comment_section:
                await comment_section.scroll_into_view_if_needed()
                await self._random_delay(1.0, 2.0)
            
        except Exception as e:
            logger.error(f"댓글 섹션 스크롤 실패: {e}")
    
    async def _scroll_comments_section(self) -> int:
        """댓글 섹션 내에서 스크롤"""
        scroll_count = 0
        max_scrolls = min(self.config.max_scroll_attempts, 20)  # 댓글은 더 적게 스크롤
        
        try:
            for i in range(max_scrolls):
                # 현재 댓글 수 확인
                current_comments = await self.page.query_selector_all(self.selectors["comment_item"])
                
                # 댓글 섹션 내에서 스크롤
                await self.page.evaluate("""
                    const commentSection = document.querySelector('[data-e2e="comment-list"]');
                    if (commentSection) {
                        commentSection.scrollTop += 500;
                    }
                """)
                scroll_count += 1
                
                # 스크롤 후 대기
                await asyncio.sleep(self.config.scroll_pause_time * 0.5)
                
                # 새로운 댓글 수 확인
                new_comments = await self.page.query_selector_all(self.selectors["comment_item"])
                
                # 댓글 수가 변하지 않으면 더 이상 로드할 댓글이 없음
                if len(new_comments) == len(current_comments):
                    break
                    
        except Exception as e:
            logger.error(f"댓글 섹션 스크롤 실패: {e}")
        
        return scroll_count
    
    async def _extract_single_comment(self, item, post_id: str, index: int) -> Optional[Dict[str, Any]]:
        """단일 댓글 정보 추출"""
        try:
            comment_data = {
                "post_id": post_id,
                "index": index,
                "scraped_at": datetime.now().isoformat()
            }
            
            # 1. 기본 정보 추출
            await self._extract_comment_basic_info(item, comment_data)
            
            # 2. 사용자 정보 추출
            await self._extract_comment_user_info(item, comment_data)
            
            # 3. 통계 정보 추출
            await self._extract_comment_statistics(item, comment_data)
            
            # 4. 시간 정보 추출
            await self._extract_comment_time_info(item, comment_data)
            
            # 필수 필드 검증
            if not comment_data.get("comment_text"):
                logger.warning(f"댓글 내용을 찾을 수 없음: {post_id} - {index}번째")
                return None
            
            return comment_data
            
        except Exception as e:
            logger.error(f"단일 댓글 추출 실패: {post_id} - {index}번째 - {e}")
            return None
    
    async def _extract_comment_basic_info(self, item, comment_data: Dict[str, Any]):
        """댓글 기본 정보 추출"""
        try:
            # 댓글 ID
            comment_id = await item.get_attribute("data-e2e")
            if comment_id:
                comment_data["comment_id"] = comment_id.replace("comment-item-", "")
            else:
                comment_data["comment_id"] = f"comment_{comment_data['index']}"
            
            # 댓글 내용
            text_element = await item.query_selector(self.selectors["comment_text"])
            if text_element:
                comment_text = await text_element.text_content()
                comment_data["comment_text"] = comment_text.strip() if comment_text else ""
            else:
                # 대체 선택자 시도
                text_element = await item.query_selector(self.selectors["alt_comment_text"])
                if text_element:
                    comment_text = await text_element.text_content()
                    comment_data["comment_text"] = comment_text.strip() if comment_text else ""
            
        except Exception as e:
            logger.error(f"댓글 기본 정보 추출 실패: {e}")
    
    async def _extract_comment_user_info(self, item, comment_data: Dict[str, Any]):
        """댓글 사용자 정보 추출"""
        try:
            # 사용자명
            username_element = await item.query_selector(self.selectors["comment_username"])
            if username_element:
                username = await username_element.text_content()
                comment_data["user_name"] = username.strip() if username else ""
            
            # 표시명
            display_name_element = await item.query_selector(self.selectors["comment_display_name"])
            if display_name_element:
                display_name = await display_name_element.text_content()
                comment_data["display_name"] = display_name.strip() if display_name else ""
            
            # 프로필 이미지 URL
            avatar_element = await item.query_selector(self.selectors["comment_avatar"])
            if avatar_element:
                avatar_url = await avatar_element.get_attribute("src")
                comment_data["user_avatar_url"] = avatar_url if avatar_url else ""
            
            # 인증 여부
            verified_element = await item.query_selector(self.selectors["comment_verified"])
            comment_data["user_verified"] = verified_element is not None
            
            # 사용자 링크
            user_element = await item.query_selector(self.selectors["comment_user"])
            if user_element:
                user_link = await user_element.get_attribute("href")
                if user_link:
                    if not user_link.startswith("http"):
                        user_link = f"{self.config.base_url}{user_link}"
                    comment_data["user_url"] = user_link
                    
                    # 사용자 ID 추출
                    url_parts = user_link.split("/")
                    if len(url_parts) > 0:
                        user_id = url_parts[-1]
                        if user_id and not user_id.startswith("@"):
                            comment_data["user_id"] = user_id
            
        except Exception as e:
            logger.error(f"댓글 사용자 정보 추출 실패: {e}")
    
    async def _extract_comment_statistics(self, item, comment_data: Dict[str, Any]):
        """댓글 통계 정보 추출"""
        try:
            # 좋아요 수
            likes_element = await item.query_selector(self.selectors["comment_likes"])
            if likes_element:
                likes_text = await likes_element.text_content()
                comment_data["likes_count"] = self._parse_count(likes_text)
            
            # 답글 수
            replies_element = await item.query_selector(self.selectors["comment_replies"])
            if replies_element:
                replies_text = await replies_element.text_content()
                comment_data["reply_count"] = self._parse_count(replies_text)
            
        except Exception as e:
            logger.error(f"댓글 통계 정보 추출 실패: {e}")
    
    async def _extract_comment_time_info(self, item, comment_data: Dict[str, Any]):
        """댓글 시간 정보 추출"""
        try:
            # 댓글 작성 시간
            time_element = await item.query_selector(self.selectors["comment_time"])
            if time_element:
                time_text = await time_element.text_content()
                comment_data["created_at"] = self._parse_comment_time(time_text)
            
        except Exception as e:
            logger.error(f"댓글 시간 정보 추출 실패: {e}")
    
    def _parse_count(self, text: str) -> int:
        """숫자 텍스트를 정수로 변환"""
        if not text:
            return 0
        
        try:
            # 숫자만 추출
            numbers = re.findall(r'[\d,]+', text.replace(',', ''))
            if numbers:
                return int(numbers[0])
            
            # K, M 단위 처리
            text_lower = text.lower().strip()
            if 'k' in text_lower:
                number = float(re.findall(r'[\d.]+', text_lower)[0])
                return int(number * 1000)
            elif 'm' in text_lower:
                number = float(re.findall(r'[\d.]+', text_lower)[0])
                return int(number * 1000000)
            
            return 0
            
        except Exception as e:
            logger.error(f"숫자 파싱 실패: {text} - {e}")
            return 0
    
    def _parse_comment_time(self, time_text: str) -> Optional[str]:
        """댓글 시간 텍스트를 ISO 형식으로 변환"""
        if not time_text:
            return None
        
        try:
            # 간단한 시간 파싱 (실제로는 더 정교한 파싱이 필요할 수 있음)
            time_text = time_text.strip().lower()
            
            if "ago" in time_text:
                # 상대적 시간 처리
                return datetime.now().isoformat()
            elif "today" in time_text:
                return datetime.now().isoformat()
            elif "yesterday" in time_text:
                from datetime import timedelta
                yesterday = datetime.now() - timedelta(days=1)
                return yesterday.isoformat()
            else:
                # 절대적 시간 처리 (간단한 형태)
                return datetime.now().isoformat()
            
        except Exception as e:
            logger.error(f"댓글 시간 파싱 실패: {time_text} - {e}")
            return None
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def scrape_comment_replies(self, comment_id: str) -> List[Dict[str, Any]]:
        """댓글의 답글 목록 스크래핑"""
        try:
            logger.info(f"댓글 답글 스크래핑 시작: {comment_id}")
            
            # 답글 버튼 클릭
            reply_button = await self.page.query_selector(f"[data-e2e='comment-reply-button-{comment_id}']")
            if reply_button:
                await reply_button.click()
                await self._random_delay(1.0, 2.0)
                
                # 답글 목록 수집
                replies = await self._extract_replies_list(comment_id)
                
                logger.info(f"댓글 답글 스크래핑 완료: {comment_id} - {len(replies)}개")
                return replies
            else:
                logger.warning(f"답글 버튼을 찾을 수 없음: {comment_id}")
                return []
                
        except Exception as e:
            logger.error(f"댓글 답글 스크래핑 실패: {comment_id} - {e}")
            return []
    
    async def _extract_replies_list(self, comment_id: str) -> List[Dict[str, Any]]:
        """답글 목록 추출 (댓글과 유사한 로직)"""
        replies = []
        
        try:
            # 답글 아이템들 찾기
            reply_items = await self.page.query_selector_all("[data-e2e='reply-item']")
            
            logger.debug(f"발견된 답글 아이템: {len(reply_items)}개")
            
            # 각 답글 처리
            for i, item in enumerate(reply_items[:50]):  # 답글은 최대 50개만
                try:
                    reply_data = await self._extract_single_reply(item, comment_id, i)
                    if reply_data:
                        replies.append(reply_data)
                    
                    # 요청 간 지연
                    await self._random_delay(0.3, 0.8)
                    
                except Exception as e:
                    logger.error(f"개별 답글 추출 실패: {comment_id} - {i}번째 - {e}")
                    continue
            
            return replies
            
        except Exception as e:
            logger.error(f"답글 목록 추출 실패: {comment_id} - {e}")
            return replies
    
    async def _extract_single_reply(self, item, comment_id: str, index: int) -> Optional[Dict[str, Any]]:
        """단일 답글 정보 추출 (댓글과 유사한 로직)"""
        try:
            reply_data = {
                "parent_comment_id": comment_id,
                "index": index,
                "scraped_at": datetime.now().isoformat(),
                "type": "reply"
            }
            
            # 댓글과 동일한 정보 추출 로직 사용
            await self._extract_comment_basic_info(item, reply_data)
            await self._extract_comment_user_info(item, reply_data)
            await self._extract_comment_statistics(item, reply_data)
            await self._extract_comment_time_info(item, reply_data)
            
            # 필수 필드 검증
            if not reply_data.get("comment_text"):
                logger.warning(f"답글 내용을 찾을 수 없음: {comment_id} - {index}번째")
                return None
            
            return reply_data
            
        except Exception as e:
            logger.error(f"단일 답글 추출 실패: {comment_id} - {index}번째 - {e}")
            return None 