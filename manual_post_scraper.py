#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
수동 게시물 스크래퍼 - 사용자가 직접 게시물을 클릭하도록 안내
"""
import asyncio
import json
from datetime import datetime
from loguru import logger
from scrapers.base_scraper import BaseScraper
from config.settings import settings

class ManualPostScraper(BaseScraper):
    """수동 게시물 스크래퍼"""
    
    def __init__(self, db_service=None, performance_tracker=None, config=None):
        super().__init__(db_service, performance_tracker, config)
        
        # 게시물 관련 선택자들
        self.selectors = {
            "like_count": "[data-e2e='like-count']",
            "comment_count": "[data-e2e='comment-count']",
            "share_count": "[data-e2e='share-count']",
            "play_count": "[data-e2e='play-count']",
            "post_content": "[data-e2e='user-post-item-desc']",
            "comment_container": "[data-e2e='comment-level-1']",
            "comment_text": "[data-e2e='comment-level-1'] [data-e2e='comment-text']",
            "comment_author": "[data-e2e='comment-level-1'] [data-e2e='comment-username']",
            "comment_likes": "[data-e2e='comment-level-1'] [data-e2e='comment-like-count']"
        }
    
    async def scrape_profile_with_manual_help(self, influencer_id: str) -> dict:
        """사용자 도움을 받아 프로필과 게시물 스크래핑"""
        try:
            logger.info(f"수동 게시물 스크래핑 시작: {influencer_id}")
            
            # TikTok 프로필 URL
            profile_url = f"{self.config.tiktok.base_url}/@{influencer_id}"
            
            # 페이지 이동
            if not await self._navigate_to_page(profile_url):
                logger.error(f"프로필 페이지 로드 실패: {influencer_id}")
                return {}
            
            # 콘텐츠 로드 대기
            await self._wait_for_content_load()
            
            # 사용자에게 안내
            print("\n" + "="*60)
            print("🎯 수동 게시물 스크래핑 모드")
            print("="*60)
            print(f"현재 페이지: @{influencer_id}")
            print("\n📋 지시사항:")
            print("1. 브라우저에서 게시물을 클릭하여 상세 페이지로 이동하세요")
            print("2. 게시물이 로드되면 Enter를 눌러주세요")
            print("3. 댓글을 더 보려면 스크롤하세요")
            print("4. 다음 게시물로 이동하려면 'next'를 입력하세요")
            print("5. 종료하려면 'quit'를 입력하세요")
            print("="*60)
            
            posts_data = []
            post_index = 0
            
            while True:
                try:
                    # 사용자 입력 대기
                    user_input = input(f"\n게시물 {post_index + 1} 준비 완료? (Enter/next/quit): ").strip().lower()
                    
                    if user_input == 'quit':
                        break
                    elif user_input == 'next':
                        print("다음 게시물로 이동하세요...")
                        continue
                    
                    # 현재 페이지 URL 확인
                    current_url = self.page.url
                    logger.info(f"현재 URL: {current_url}")
                    
                    # 게시물 페이지인지 확인
                    if '/video/' not in current_url:
                        print("❌ 게시물 페이지가 아닙니다. 게시물을 클릭해주세요.")
                        continue
                    
                    # 게시물 데이터 추출
                    post_data = await self._extract_current_post_data(influencer_id, post_index, current_url)
                    
                    if post_data:
                        posts_data.append(post_data)
                        print(f"✅ 게시물 {post_index + 1} 스크래핑 완료!")
                        print(f"   좋아요: {post_data.get('hearts', 0):,}")
                        print(f"   댓글: {post_data.get('comment_count', 0):,}")
                        print(f"   공유: {post_data.get('shares', 0):,}")
                        print(f"   조회수: {post_data.get('views', 0):,}")
                        print(f"   댓글 수집: {len(post_data.get('comments', []))}개")
                        
                        post_index += 1
                    else:
                        print("❌ 게시물 데이터 추출 실패")
                    
                except KeyboardInterrupt:
                    print("\n\n⏹️  사용자에 의해 중단되었습니다.")
                    break
                except Exception as e:
                    logger.error(f"게시물 스크래핑 오류: {e}")
                    print(f"❌ 오류 발생: {e}")
            
            result = {
                "influencer_id": influencer_id,
                "profile_url": profile_url,
                "posts": posts_data,
                "total_posts": len(posts_data),
                "scraped_at": datetime.now().isoformat()
            }
            
            logger.info(f"수동 게시물 스크래핑 완료: {influencer_id} - {len(posts_data)}개")
            return result
            
        except Exception as e:
            logger.error(f"수동 게시물 스크래핑 실패: {influencer_id} - {e}")
            return {}
    
    async def _extract_current_post_data(self, influencer_id: str, index: int, post_url: str) -> dict:
        """현재 페이지의 게시물 데이터 추출"""
        try:
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
            
            # 게시물 통계 정보 추출
            await self._extract_post_statistics(post_data)
            
            # 게시물 내용 추출
            await self._extract_post_content(post_data)
            
            # 댓글 정보 추출
            comments = await self._extract_comments(post_data)
            post_data["comments"] = comments
            post_data["comment_count"] = len(comments)
            
            return post_data
            
        except Exception as e:
            logger.error(f"현재 게시물 데이터 추출 실패: {e}")
            return {}
    
    def _extract_post_id(self, post_url: str) -> str:
        """게시물 ID 추출"""
        try:
            import re
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
    
    async def _extract_post_statistics(self, post_data: dict):
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
            
        except Exception as e:
            logger.error(f"게시물 통계 정보 추출 실패: {e}")
    
    async def _extract_post_content(self, post_data: dict):
        """게시물 내용 추출"""
        try:
            # 게시물 내용
            content = await self._get_text_content(self.selectors["post_content"])
            post_data["content"] = content.strip() if content else ""
            
            # 해시태그 추출
            import re
            hashtags = re.findall(r'#\w+', post_data.get("content", ""))
            post_data["hashtags"] = hashtags
            
            # 멘션 추출
            mentions = re.findall(r'@\w+', post_data.get("content", ""))
            post_data["mentions"] = mentions
            
        except Exception as e:
            logger.error(f"게시물 내용 추출 실패: {e}")
    
    async def _extract_comments(self, post_data: dict) -> list:
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
            
            # 추가 스크롤
            for _ in range(3):
                await self.page.evaluate("window.scrollBy(0, 500)")
                await self._random_delay(1, 2)
                
        except Exception as e:
            logger.debug(f"댓글 더 로드 실패: {e}")
    
    async def _extract_single_comment(self, container, index: int) -> dict:
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
            return {}
    
    def _parse_count(self, text: str) -> int:
        """숫자 텍스트를 정수로 변환"""
        if not text:
            return 0
        
        try:
            import re
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

async def main():
    """메인 함수"""
    scraper = None
    try:
        # 스크래퍼 초기화
        scraper = ManualPostScraper(config=settings)
        await scraper.initialize()
        
        # 테스트할 인플루언서
        test_influencer = "charlidamelio"
        
        print(f"\n{'='*60}")
        print("🎯 TikTok 수동 게시물 스크래퍼")
        print("="*60)
        print(f"대상: @{test_influencer}")
        print("브라우저가 열리면 게시물을 클릭하여 상세 페이지로 이동하세요.")
        print("="*60)
        
        # 수동 게시물 스크래핑
        result = await scraper.scrape_profile_with_manual_help(test_influencer)
        
        if result and result.get("posts"):
            # 결과 저장
            with open("manual_post_results.json", "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            
            print(f"\n{'='*60}")
            print("🎉 수동 게시물 스크래핑 완료!")
            print("="*60)
            print(f"수집된 게시물: {len(result['posts'])}개")
            print("결과가 manual_post_results.json 파일에 저장되었습니다.")
            
            # 요약 출력
            for i, post in enumerate(result["posts"], 1):
                print(f"\n게시물 {i}:")
                print(f"  좋아요: {post.get('hearts', 0):,}")
                print(f"  댓글: {post.get('comment_count', 0):,}")
                print(f"  공유: {post.get('shares', 0):,}")
                print(f"  조회수: {post.get('views', 0):,}")
                print(f"  댓글 수집: {len(post.get('comments', []))}개")
        else:
            print("\n❌ 게시물 스크래핑 실패")
            
    except KeyboardInterrupt:
        print("\n\n⏹️  사용자에 의해 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 예상치 못한 오류: {e}")
    finally:
        if scraper:
            await scraper.cleanup()

if __name__ == "__main__":
    asyncio.run(main()) 