"""
TikTok 프로필 스크래퍼 - 완전 재작성 버전
"""
import re
import json
from typing import Dict, Any, Optional
from datetime import datetime
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from .base_scraper import BaseScraper

class TikTokProfileScraper(BaseScraper):
    """TikTok 프로필 스크래퍼 - 완전 재작성"""
    
    def __init__(self, db_service=None, performance_tracker=None, config=None):
        super().__init__(db_service, performance_tracker, config)
        
        # TikTok 프로필 관련 선택자들 (2024년 최신)
        self.selectors = {
            # 기본 정보
            "username": "h1[data-e2e='user-title']",
            "display_name": "h2[data-e2e='user-subtitle']",
            "bio": "h2[data-e2e='user-subtitle'] + div",
            "avatar": "img[data-e2e='user-avatar']",
            
            # 통계 정보 (다양한 선택자 시도)
            "stats_container": "[data-e2e='user-stats']",
            "following_count": "a[href*='following'] strong",
            "followers_count": "a[href*='followers'] strong", 
            "likes_count": "a[href*='likes'] strong",
            "video_count": "a[href*='videos'] strong",
            
            # 대체 선택자들
            "alt_stats": "strong[data-e2e*='count']",
            "alt_following": "[data-e2e='following-count']",
            "alt_followers": "[data-e2e='followers-count']",
            "alt_likes": "[data-e2e='likes-count']",
            "alt_videos": "[data-e2e='video-count']",
            
            # 추가 정보
            "verified_badge": "[data-e2e='user-verified']",
            "category": "[data-e2e='user-category']",
            "location": "[data-e2e='user-location']"
        }
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def scrape_profile(self, influencer_id: str) -> Optional[Dict[str, Any]]:
        """인플루언서 프로필 정보 스크래핑"""
        try:
            logger.info(f"프로필 스크래핑 시작: {influencer_id}")
            
            # TikTok 프로필 URL 구성
            profile_url = f"{self.config.tiktok.base_url}/@{influencer_id}"
            
            # 페이지 이동
            if not await self._navigate_to_page(profile_url):
                logger.error(f"프로필 페이지 로드 실패: {influencer_id}")
                return None
            
            # 캡차 및 속도 제한 확인
            if await self._handle_captcha():
                logger.warning(f"캡차 감지됨: {influencer_id}")
                return None
            
            if await self._handle_rate_limit():
                logger.warning(f"속도 제한 감지됨: {influencer_id}")
                return None
            
            # 페이지가 완전히 로드될 때까지 대기
            await self._wait_for_page_load()
            
            # 프로필 정보 수집
            profile_data = await self._extract_profile_data(influencer_id, profile_url)
            
            if profile_data:
                logger.info(f"프로필 스크래핑 완료: {influencer_id}")
                logger.info(f"수집된 데이터: {profile_data}")
                return profile_data
            else:
                logger.error(f"프로필 데이터 추출 실패: {influencer_id}")
                return None
                
        except Exception as e:
            logger.error(f"프로필 스크래핑 실패: {influencer_id} - {e}")
            return None
    
    async def _wait_for_page_load(self):
        """페이지 완전 로드 대기"""
        try:
            # 기본 요소들이 로드될 때까지 대기
            await self.page.wait_for_load_state("networkidle", timeout=15000)
            
            # 사용자명이 나타날 때까지 대기
            try:
                await self.page.wait_for_selector(self.selectors["username"], timeout=10000)
            except:
                # 대체 선택자 시도
                await self.page.wait_for_selector("h1", timeout=10000)
            
            # 추가 대기
            await self._random_delay(2, 4)
            
        except Exception as e:
            logger.warning(f"페이지 로드 대기 실패: {e}")
    
    async def _extract_profile_data(self, influencer_id: str, profile_url: str) -> Optional[Dict[str, Any]]:
        """프로필 데이터 추출"""
        try:
            profile_data = {
                "tiktok_id": influencer_id,
                "profile_url": profile_url,
                "scraped_at": datetime.now().isoformat()
            }
            
            # 1. 기본 정보 추출
            await self._extract_basic_info(profile_data)
            
            # 2. 통계 정보 추출 (중요!)
            await self._extract_statistics(profile_data)
            
            # 3. 추가 정보 추출
            await self._extract_additional_info(profile_data)
            
            # 4. 원시 데이터 저장
            profile_data["raw_data"] = await self._get_raw_page_data()
            
            # 필수 필드 검증
            if not profile_data.get("tiktok_name"):
                logger.warning(f"사용자명을 찾을 수 없음: {influencer_id}")
                return None
            
            return profile_data
            
        except Exception as e:
            logger.error(f"프로필 데이터 추출 실패: {influencer_id} - {e}")
            return None
    
    async def _extract_basic_info(self, profile_data: Dict[str, Any]):
        """기본 정보 추출"""
        try:
            # 사용자명 (가장 중요)
            username = await self._get_text_content(self.selectors["username"])
            if not username:
                # 대체 방법들 시도
                username_selectors = [
                    "h1",
                    "[data-e2e='user-title']",
                    "h1[data-e2e='user-title']",
                    ".user-title"
                ]
                for selector in username_selectors:
                    username = await self._get_text_content(selector)
                    if username:
                        break
            
            profile_data["tiktok_name"] = username.strip() if username else ""
            logger.info(f"사용자명 추출: {profile_data['tiktok_name']}")
            
            # 표시명
            display_name = await self._get_text_content(self.selectors["display_name"])
            profile_data["display_name"] = display_name.strip() if display_name else ""
            
            # 프로필 설명
            bio = await self._get_text_content(self.selectors["bio"])
            profile_data["description"] = bio.strip() if bio else ""
            
            # 프로필 이미지 URL
            avatar_url = await self._get_attribute(self.selectors["avatar"], "src")
            profile_data["avatar_url"] = avatar_url if avatar_url else ""
            
        except Exception as e:
            logger.error(f"기본 정보 추출 실패: {e}")
    
    async def _extract_statistics(self, profile_data: Dict[str, Any]):
        """통계 정보 추출 - 완전 재작성"""
        try:
            logger.info("통계 정보 추출 시작...")
            
            # 페이지의 모든 텍스트 내용을 로그로 확인
            page_text = await self.page.evaluate("() => document.body.innerText")
            logger.info(f"페이지 텍스트 일부: {page_text[:1000]}...")
            
            # 1. 먼저 통계 컨테이너 찾기
            stats_container = await self.page.query_selector(self.selectors["stats_container"])
            
            if stats_container:
                logger.info("통계 컨테이너 발견")
                # 통계 컨테이너 내에서 숫자 찾기
                stats_text = await stats_container.text_content()
                logger.info(f"통계 컨테이너 텍스트: {stats_text}")
                
                # 숫자 추출
                numbers = re.findall(r'[\d,]+[KMB]?', stats_text)
                logger.info(f"추출된 숫자들: {numbers}")
                
                if len(numbers) >= 4:
                    profile_data["following"] = self._parse_count(numbers[0])
                    profile_data["followers"] = self._parse_count(numbers[1])
                    profile_data["hearts"] = self._parse_count(numbers[2])
                    profile_data["videos"] = self._parse_count(numbers[3])
                    
                    logger.info(f"통계 추출 성공: 팔로잉={profile_data['following']}, 팔로워={profile_data['followers']}, 좋아요={profile_data['hearts']}, 비디오={profile_data['videos']}")
                    return
            
            # 2. 개별 링크로 통계 찾기
            logger.info("개별 링크로 통계 찾기 시도...")
            
            # 팔로잉 수
            following_text = await self._try_multiple_selectors([
                "a[href*='following'] strong",
                "[data-e2e='following-count']",
                "a[href*='following']"
            ])
            profile_data["following"] = self._parse_count(following_text)
            logger.info(f"팔로잉 수: {following_text} -> {profile_data['following']}")
            
            # 팔로워 수
            followers_text = await self._try_multiple_selectors([
                "a[href*='followers'] strong",
                "[data-e2e='followers-count']",
                "a[href*='followers']"
            ])
            profile_data["followers"] = self._parse_count(followers_text)
            logger.info(f"팔로워 수: {followers_text} -> {profile_data['followers']}")
            
            # 좋아요 수
            likes_text = await self._try_multiple_selectors([
                "a[href*='likes'] strong",
                "[data-e2e='likes-count']",
                "a[href*='likes']"
            ])
            profile_data["hearts"] = self._parse_count(likes_text)
            logger.info(f"좋아요 수: {likes_text} -> {profile_data['hearts']}")
            
            # 비디오 수
            video_text = await self._try_multiple_selectors([
                "a[href*='videos'] strong",
                "[data-e2e='video-count']",
                "a[href*='videos']"
            ])
            profile_data["videos"] = self._parse_count(video_text)
            logger.info(f"비디오 수: {video_text} -> {profile_data['videos']}")
            
            # 3. JavaScript로 직접 추출 시도
            if not any([profile_data["following"], profile_data["followers"], profile_data["hearts"], profile_data["videos"]]):
                logger.info("JavaScript로 직접 추출 시도...")
                await self._extract_statistics_with_js(profile_data)
            
        except Exception as e:
            logger.error(f"통계 정보 추출 실패: {e}")
    
    async def _extract_statistics_with_js(self, profile_data: Dict[str, Any]):
        """JavaScript로 통계 정보 직접 추출"""
        try:
            # JavaScript로 모든 링크와 텍스트 찾기
            stats_data = await self.page.evaluate("""
                () => {
                    const stats = {};
                    
                    // 모든 링크 찾기
                    const links = Array.from(document.querySelectorAll('a'));
                    
                    links.forEach(link => {
                        const href = link.href;
                        const text = link.textContent?.trim();
                        
                        if (href.includes('following')) {
                            stats.following = text;
                        } else if (href.includes('followers')) {
                            stats.followers = text;
                        } else if (href.includes('likes')) {
                            stats.likes = text;
                        } else if (href.includes('videos')) {
                            stats.videos = text;
                        }
                    });
                    
                    // 모든 strong 태그 찾기
                    const strongs = Array.from(document.querySelectorAll('strong'));
                    strongs.forEach((strong, index) => {
                        const text = strong.textContent?.trim();
                        if (text && /\\d+/.test(text)) {
                            stats[`strong_${index}`] = text;
                        }
                    });
                    
                    return stats;
                }
            """)
            
            logger.info(f"JavaScript 추출 결과: {stats_data}")
            
            # 결과 파싱
            if stats_data.get("following"):
                profile_data["following"] = self._parse_count(stats_data["following"])
            if stats_data.get("followers"):
                profile_data["followers"] = self._parse_count(stats_data["followers"])
            if stats_data.get("likes"):
                profile_data["hearts"] = self._parse_count(stats_data["likes"])
            if stats_data.get("videos"):
                profile_data["videos"] = self._parse_count(stats_data["videos"])
            
        except Exception as e:
            logger.error(f"JavaScript 통계 추출 실패: {e}")
    
    async def _try_multiple_selectors(self, selectors: list) -> str:
        """여러 선택자를 시도하여 텍스트 추출"""
        for selector in selectors:
            try:
                text = await self._get_text_content(selector)
                if text and text.strip():
                    return text.strip()
            except Exception as e:
                logger.debug(f"선택자 {selector} 실패: {e}")
                continue
        return ""
    
    async def _extract_additional_info(self, profile_data: Dict[str, Any]):
        """추가 정보 추출"""
        try:
            # 인증 여부
            verified_element = await self.page.query_selector(self.selectors["verified_badge"])
            profile_data["is_verified"] = verified_element is not None
            
            # 카테고리
            category = await self._get_text_content(self.selectors["category"])
            profile_data["category"] = category.strip() if category else ""
            
            # 위치
            location = await self._get_text_content(self.selectors["location"])
            profile_data["country"] = location.strip() if location else ""
            
            # 참여율 계산 (팔로워가 있는 경우)
            if profile_data.get("followers", 0) > 0 and profile_data.get("hearts", 0) > 0:
                engage_rate = (profile_data["hearts"] / profile_data["followers"]) * 100
                profile_data["engage_rate"] = round(engage_rate, 2)
            else:
                profile_data["engage_rate"] = 0.0
            
        except Exception as e:
            logger.error(f"추가 정보 추출 실패: {e}")
    
    def _parse_count(self, text: str) -> int:
        """숫자 텍스트를 정수로 변환"""
        if not text:
            return 0
        
        try:
            # 쉼표 제거
            text = text.replace(',', '')
            
            # K, M 단위 처리
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
    
    async def _get_raw_page_data(self) -> Dict[str, Any]:
        """페이지 원시 데이터 수집"""
        try:
            raw_data = {
                "page_title": await self.page.title(),
                "page_url": self.page.url,
                "user_agent": self.current_user_agent,
                "viewport_size": {
                    "width": self.config.viewport_width,
                    "height": self.config.viewport_height
                },
                "timestamp": datetime.now().isoformat()
            }
            
            # 페이지 메타데이터
            meta_tags = await self.page.evaluate("""
                () => {
                    const metas = document.querySelectorAll('meta');
                    const metaData = {};
                    metas.forEach(meta => {
                        const name = meta.getAttribute('name') || meta.getAttribute('property');
                        const content = meta.getAttribute('content');
                        if (name && content) {
                            metaData[name] = content;
                        }
                    });
                    return metaData;
                }
            """)
            raw_data["meta_tags"] = meta_tags
            
            return raw_data
            
        except Exception as e:
            logger.error(f"원시 데이터 수집 실패: {e}")
            return {}
    
    async def scrape_multiple_profiles(self, influencer_ids: list) -> list:
        """여러 프로필 스크래핑"""
        results = []
        
        for influencer_id in influencer_ids:
            try:
                profile_data = await self.scrape_profile(influencer_id)
                if profile_data:
                    results.append(profile_data)
                
                # 요청 간 지연
                await self._random_delay(3, 6)
                
            except Exception as e:
                logger.error(f"다중 프로필 스크래핑 실패: {influencer_id} - {e}")
                continue
        
        return results 