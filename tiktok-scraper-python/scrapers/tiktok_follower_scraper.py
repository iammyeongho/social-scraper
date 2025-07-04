"""
TikTok 팔로워 스크래퍼
"""
import re
import json
from typing import Dict, Any, Optional, List
from datetime import datetime
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from .base_scraper import BaseScraper

class TikTokFollowerScraper(BaseScraper):
    """TikTok 팔로워 스크래퍼"""
    
    def __init__(self, db_service=None, performance_tracker=None, config=None):
        super().__init__(db_service, performance_tracker, config)
        
        # TikTok 팔로워 관련 선택자들
        self.selectors = {
            # 팔로워 목록
            "follower_list": "[data-e2e='follower-list']",
            "follower_item": "[data-e2e='follower-item']",
            
            # 팔로워 정보
            "follower_username": "[data-e2e='follower-username']",
            "follower_display_name": "[data-e2e='follower-display-name']",
            "follower_avatar": "[data-e2e='follower-avatar'] img",
            "follower_verified": "[data-e2e='follower-verified']",
            
            # 팔로워 통계
            "follower_count": "[data-e2e='follower-count']",
            "following_count": "[data-e2e='following-count']",
            
            # 팔로워 링크
            "follower_link": "[data-e2e='follower-item'] a",
            
            # 대체 선택자들
            "alt_follower_list": ".follower-list",
            "alt_follower_item": ".follower-item",
            "alt_follower_username": ".follower-username",
            "alt_follower_display_name": ".follower-display-name"
        }
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def scrape_followers(self, influencer_id: str) -> List[Dict[str, Any]]:
        """인플루언서의 팔로워 목록 스크래핑"""
        try:
            logger.info(f"팔로워 스크래핑 시작: {influencer_id}")
            
            # TikTok 팔로워 페이지 URL 구성
            followers_url = f"{self.config.base_url}/@{influencer_id}/followers"
            
            # 페이지 이동
            if not await self._navigate_to_page(followers_url, wait_for_selector="[data-e2e='follower-item']"):
                logger.error(f"팔로워 페이지 로드 실패: {influencer_id}")
                return []
            
            # 캡차 및 속도 제한 확인
            if await self._handle_captcha():
                logger.warning(f"캡차 감지됨: {influencer_id}")
                return []
            
            if await self._handle_rate_limit():
                logger.warning(f"속도 제한 감지됨: {influencer_id}")
                return []
            
            # 팔로워 목록 수집
            followers = await self._extract_followers_list(influencer_id)
            
            logger.info(f"팔로워 스크래핑 완료: {influencer_id} - {len(followers)}명")
            return followers
            
        except Exception as e:
            logger.error(f"팔로워 스크래핑 실패: {influencer_id} - {e}")
            return []
    
    async def _extract_followers_list(self, influencer_id: str) -> List[Dict[str, Any]]:
        """팔로워 목록 추출"""
        followers = []
        
        try:
            # 페이지 스크롤하여 더 많은 팔로워 로드
            scroll_count = await self._scroll_page()
            logger.debug(f"팔로워 페이지 스크롤 완료: {scroll_count}회")
            
            # 팔로워 아이템들 찾기
            follower_items = await self.page.query_selector_all(self.selectors["follower_item"])
            
            if not follower_items:
                # 대체 선택자 시도
                follower_items = await self.page.query_selector_all(self.selectors["alt_follower_item"])
            
            logger.debug(f"발견된 팔로워 아이템: {len(follower_items)}개")
            
            # 각 팔로워 처리
            for i, item in enumerate(follower_items[:self.config.max_followers_per_influencer]):
                try:
                    follower_data = await self._extract_single_follower(item, influencer_id, i)
                    if follower_data:
                        followers.append(follower_data)
                    
                    # 요청 간 지연
                    await self._random_delay(0.5, 1.0)
                    
                except Exception as e:
                    logger.error(f"개별 팔로워 추출 실패: {influencer_id} - {i}번째 - {e}")
                    continue
            
            return followers
            
        except Exception as e:
            logger.error(f"팔로워 목록 추출 실패: {influencer_id} - {e}")
            return followers
    
    async def _extract_single_follower(self, item, influencer_id: str, index: int) -> Optional[Dict[str, Any]]:
        """단일 팔로워 정보 추출"""
        try:
            follower_data = {
                "influencer_id": influencer_id,
                "index": index,
                "discovered_at": datetime.now().isoformat()
            }
            
            # 1. 기본 정보 추출
            await self._extract_follower_basic_info(item, follower_data)
            
            # 2. 통계 정보 추출
            await self._extract_follower_statistics(item, follower_data)
            
            # 3. 추가 정보 추출
            await self._extract_follower_additional_info(item, follower_data)
            
            # 필수 필드 검증
            if not follower_data.get("follower_username"):
                logger.warning(f"팔로워 사용자명을 찾을 수 없음: {influencer_id} - {index}번째")
                return None
            
            return follower_data
            
        except Exception as e:
            logger.error(f"단일 팔로워 추출 실패: {influencer_id} - {index}번째 - {e}")
            return None
    
    async def _extract_follower_basic_info(self, item, follower_data: Dict[str, Any]):
        """팔로워 기본 정보 추출"""
        try:
            # 사용자명
            username_element = await item.query_selector(self.selectors["follower_username"])
            if username_element:
                username = await username_element.text_content()
                follower_data["follower_username"] = username.strip() if username else ""
            else:
                # 대체 선택자 시도
                username_element = await item.query_selector(self.selectors["alt_follower_username"])
                if username_element:
                    username = await username_element.text_content()
                    follower_data["follower_username"] = username.strip() if username else ""
            
            # 표시명
            display_name_element = await item.query_selector(self.selectors["follower_display_name"])
            if display_name_element:
                display_name = await display_name_element.text_content()
                follower_data["follower_display_name"] = display_name.strip() if display_name else ""
            else:
                # 대체 선택자 시도
                display_name_element = await item.query_selector(self.selectors["alt_follower_display_name"])
                if display_name_element:
                    display_name = await display_name_element.text_content()
                    follower_data["follower_display_name"] = display_name.strip() if display_name else ""
            
            # 프로필 이미지 URL
            avatar_element = await item.query_selector(self.selectors["follower_avatar"])
            if avatar_element:
                avatar_url = await avatar_element.get_attribute("src")
                follower_data["follower_avatar_url"] = avatar_url if avatar_url else ""
            
            # 팔로워 링크
            link_element = await item.query_selector(self.selectors["follower_link"])
            if link_element:
                follower_url = await link_element.get_attribute("href")
                if follower_url:
                    if not follower_url.startswith("http"):
                        follower_url = f"{self.config.base_url}{follower_url}"
                    follower_data["follower_url"] = follower_url
            
        except Exception as e:
            logger.error(f"팔로워 기본 정보 추출 실패: {e}")
    
    async def _extract_follower_statistics(self, item, follower_data: Dict[str, Any]):
        """팔로워 통계 정보 추출"""
        try:
            # 팔로워 수
            follower_count_element = await item.query_selector(self.selectors["follower_count"])
            if follower_count_element:
                follower_count_text = await follower_count_element.text_content()
                follower_data["follower_count"] = self._parse_count(follower_count_text)
            
            # 팔로잉 수
            following_count_element = await item.query_selector(self.selectors["following_count"])
            if following_count_element:
                following_count_text = await following_count_element.text_content()
                follower_data["following_count"] = self._parse_count(following_count_text)
            
        except Exception as e:
            logger.error(f"팔로워 통계 정보 추출 실패: {e}")
    
    async def _extract_follower_additional_info(self, item, follower_data: Dict[str, Any]):
        """팔로워 추가 정보 추출"""
        try:
            # 인증 여부
            verified_element = await item.query_selector(self.selectors["follower_verified"])
            follower_data["is_verified"] = verified_element is not None
            
            # 팔로워 ID 추출 (URL에서)
            if follower_data.get("follower_url"):
                url_parts = follower_data["follower_url"].split("/")
                if len(url_parts) > 0:
                    follower_id = url_parts[-1]
                    if follower_id and not follower_id.startswith("@"):
                        follower_data["follower_id"] = follower_id
            
        except Exception as e:
            logger.error(f"팔로워 추가 정보 추출 실패: {e}")
    
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
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def scrape_following(self, influencer_id: str) -> List[Dict[str, Any]]:
        """인플루언서의 팔로잉 목록 스크래핑"""
        try:
            logger.info(f"팔로잉 스크래핑 시작: {influencer_id}")
            
            # TikTok 팔로잉 페이지 URL 구성
            following_url = f"{self.config.base_url}/@{influencer_id}/following"
            
            # 페이지 이동
            if not await self._navigate_to_page(following_url, wait_for_selector="[data-e2e='following-item']"):
                logger.error(f"팔로잉 페이지 로드 실패: {influencer_id}")
                return []
            
            # 캡차 및 속도 제한 확인
            if await self._handle_captcha():
                logger.warning(f"캡차 감지됨: {influencer_id}")
                return []
            
            if await self._handle_rate_limit():
                logger.warning(f"속도 제한 감지됨: {influencer_id}")
                return []
            
            # 팔로잉 목록 수집 (팔로워와 유사한 구조)
            following = await self._extract_following_list(influencer_id)
            
            logger.info(f"팔로잉 스크래핑 완료: {influencer_id} - {len(following)}명")
            return following
            
        except Exception as e:
            logger.error(f"팔로잉 스크래핑 실패: {influencer_id} - {e}")
            return []
    
    async def _extract_following_list(self, influencer_id: str) -> List[Dict[str, Any]]:
        """팔로잉 목록 추출 (팔로워와 유사한 로직)"""
        following = []
        
        try:
            # 페이지 스크롤
            scroll_count = await self._scroll_page()
            logger.debug(f"팔로잉 페이지 스크롤 완료: {scroll_count}회")
            
            # 팔로잉 아이템들 찾기
            following_items = await self.page.query_selector_all("[data-e2e='following-item']")
            
            logger.debug(f"발견된 팔로잉 아이템: {len(following_items)}개")
            
            # 각 팔로잉 처리
            for i, item in enumerate(following_items[:self.config.max_followers_per_influencer]):
                try:
                    following_data = await self._extract_single_following(item, influencer_id, i)
                    if following_data:
                        following.append(following_data)
                    
                    # 요청 간 지연
                    await self._random_delay(0.5, 1.0)
                    
                except Exception as e:
                    logger.error(f"개별 팔로잉 추출 실패: {influencer_id} - {i}번째 - {e}")
                    continue
            
            return following
            
        except Exception as e:
            logger.error(f"팔로잉 목록 추출 실패: {influencer_id} - {e}")
            return following
    
    async def _extract_single_following(self, item, influencer_id: str, index: int) -> Optional[Dict[str, Any]]:
        """단일 팔로잉 정보 추출 (팔로워와 유사한 로직)"""
        try:
            following_data = {
                "influencer_id": influencer_id,
                "index": index,
                "discovered_at": datetime.now().isoformat(),
                "type": "following"
            }
            
            # 팔로워와 동일한 정보 추출 로직 사용
            await self._extract_follower_basic_info(item, following_data)
            await self._extract_follower_statistics(item, following_data)
            await self._extract_follower_additional_info(item, following_data)
            
            # 필수 필드 검증
            if not following_data.get("follower_username"):
                logger.warning(f"팔로잉 사용자명을 찾을 수 없음: {influencer_id} - {index}번째")
                return None
            
            return following_data
            
        except Exception as e:
            logger.error(f"단일 팔로잉 추출 실패: {influencer_id} - {index}번째 - {e}")
            return None 