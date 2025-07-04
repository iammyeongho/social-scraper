"""
API 클라이언트 서비스
"""
import asyncio
import aiohttp
import json
from typing import Dict, List, Optional, Any
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from config.settings import settings

class ApiClient:
    """API 클라이언트 서비스"""
    
    def __init__(self, api_config=None):
        self.config = api_config or settings.api
        self.session = None
    
    async def __aenter__(self):
        """비동기 컨텍스트 매니저 진입"""
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=self.config.timeout),
            headers=self.config.headers
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """비동기 컨텍스트 매니저 종료"""
        if self.session:
            await self.session.close()
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def check_api_status(self) -> bool:
        """API 상태 확인"""
        try:
            if not self.session:
                async with aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=self.config.timeout),
                    headers=self.config.headers
                ) as session:
                    async with session.get(f"{self.config.influencer_api_url}/health") as response:
                        return response.status == 200
            else:
                async with self.session.get(f"{self.config.influencer_api_url}/health") as response:
                    return response.status == 200
                    
        except Exception as e:
            logger.error(f"API 상태 확인 실패: {e}")
            return False
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def get_influencer_ids(self) -> List[str]:
        """인플루언서 ID 목록 조회"""
        try:
            # API 연동이 안된 상태이므로 하드코딩된 인플루언서 목록 반환
            # 실제 API 연동 시에는 아래 주석 처리된 코드를 사용
            """
            headers = self.config.influencer_headers
            
            if not self.session:
                async with aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=self.config.timeout),
                    headers=headers
                ) as session:
                    async with session.get(f"{self.config.influencer_api_url}/tiktok/influencers") as response:
                        if response.status == 200:
                            data = await response.json()
                            return data.get('influencer_ids', [])
                        else:
                            logger.error(f"인플루언서 ID 조회 실패: HTTP {response.status}")
                            return []
            else:
                async with self.session.get(f"{self.config.influencer_api_url}/tiktok/influencers") as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get('influencer_ids', [])
                    else:
                        logger.error(f"인플루언서 ID 조회 실패: HTTP {response.status}")
                        return []
            """
            
            # 설정에서 테스트용 인플루언서 목록 가져오기
            if not self.config.use_api:
                logger.info(f"테스트용 인플루언서 목록 사용: {len(self.config.test_influencer_ids)}개")
                return self.config.test_influencer_ids.copy()
            else:
                # API 사용 시 실제 API 호출 (현재는 테스트 목록 반환)
                logger.warning("API 연동이 완료되지 않아 테스트 목록을 반환합니다")
                return self.config.test_influencer_ids.copy()
                        
        except Exception as e:
            logger.error(f"인플루언서 ID 조회 실패: {e}")
            return []
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def send_scraping_results(self, results: List[Dict[str, Any]]) -> bool:
        """스크래핑 결과 전송"""
        try:
            headers = self.config.result_headers
            payload = {
                "platform": "tiktok",
                "results": results,
                "timestamp": asyncio.get_event_loop().time(),
                "total_count": len(results)
            }
            
            if not self.session:
                async with aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=self.config.timeout),
                    headers=headers
                ) as session:
                    async with session.post(
                        f"{self.config.result_api_url}/scraping-results",
                        json=payload
                    ) as response:
                        if response.status == 200:
                            logger.info(f"스크래핑 결과 전송 성공: {len(results)}개")
                            return True
                        else:
                            logger.error(f"스크래핑 결과 전송 실패: HTTP {response.status}")
                            return False
            else:
                async with self.session.post(
                    f"{self.config.result_api_url}/scraping-results",
                    json=payload
                ) as response:
                    if response.status == 200:
                        logger.info(f"스크래핑 결과 전송 성공: {len(results)}개")
                        return True
                    else:
                        logger.error(f"스크래핑 결과 전송 실패: HTTP {response.status}")
                        return False
                        
        except Exception as e:
            logger.error(f"스크래핑 결과 전송 실패: {e}")
            return False
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def get_influencer_details(self, influencer_id: str) -> Optional[Dict[str, Any]]:
        """인플루언서 상세 정보 조회"""
        try:
            headers = self.config.influencer_headers
            
            if not self.session:
                async with aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=self.config.timeout),
                    headers=headers
                ) as session:
                    async with session.get(f"{self.config.influencer_api_url}/tiktok/influencer/{influencer_id}") as response:
                        if response.status == 200:
                            return await response.json()
                        else:
                            logger.error(f"인플루언서 상세 정보 조회 실패: HTTP {response.status}")
                            return None
            else:
                async with self.session.get(f"{self.config.influencer_api_url}/tiktok/influencer/{influencer_id}") as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.error(f"인플루언서 상세 정보 조회 실패: HTTP {response.status}")
                        return None
                        
        except Exception as e:
            logger.error(f"인플루언서 상세 정보 조회 실패: {e}")
            return None
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def update_influencer_status(self, influencer_id: str, status: str, data: Dict[str, Any] = None) -> bool:
        """인플루언서 상태 업데이트"""
        try:
            headers = self.config.influencer_headers
            payload = {
                "influencer_id": influencer_id,
                "status": status,
                "timestamp": asyncio.get_event_loop().time()
            }
            
            if data:
                payload["data"] = data
            
            if not self.session:
                async with aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=self.config.timeout),
                    headers=headers
                ) as session:
                    async with session.put(
                        f"{self.config.influencer_api_url}/tiktok/influencer/{influencer_id}/status",
                        json=payload
                    ) as response:
                        return response.status == 200
            else:
                async with self.session.put(
                    f"{self.config.influencer_api_url}/tiktok/influencer/{influencer_id}/status",
                    json=payload
                ) as response:
                    return response.status == 200
                    
        except Exception as e:
            logger.error(f"인플루언서 상태 업데이트 실패: {e}")
            return False
    
    async def close(self):
        """세션 종료"""
        if self.session:
            await self.session.close() 