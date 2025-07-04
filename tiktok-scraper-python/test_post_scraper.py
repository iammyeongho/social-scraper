#!/usr/bin/env python3
"""
TikTok 게시물 및 댓글 스크래퍼 테스트
"""
import asyncio
import json
from loguru import logger
from scrapers.tiktok_post_scraper import TikTokPostScraper
from config.settings import settings

async def test_post_scraper():
    """게시물 스크래퍼 테스트"""
    scraper = None
    try:
        logger.info("=== TikTok 게시물 스크래퍼 테스트 시작 ===")
        
        # 스크래퍼 초기화
        scraper = TikTokPostScraper(config=settings)
        await scraper.initialize()
        
        # 테스트할 인플루언서 목록
        test_influencers = [
            "charlidamelio",  # 유명한 TikToker
            "bellapoarch",    # 또 다른 유명 TikToker
        ]
        
        all_results = {}
        
        for influencer_id in test_influencers:
            try:
                logger.info(f"\n{'='*50}")
                logger.info(f"게시물 스크래핑 중: @{influencer_id}")
                logger.info(f"{'='*50}")
                
                # 게시물 스크래핑 (최대 3개)
                posts = await scraper.scrape_profile_posts(influencer_id, max_posts=3)
                
                if posts:
                    all_results[influencer_id] = posts
                    
                    # 결과 출력
                    logger.info(f"✅ 성공: @{influencer_id}")
                    logger.info(f"   수집된 게시물: {len(posts)}개")
                    
                    for i, post in enumerate(posts, 1):
                        logger.info(f"   게시물 {i}:")
                        logger.info(f"     좋아요: {post.get('hearts', 0):,}")
                        logger.info(f"     댓글: {post.get('comment_count', 0):,}")
                        logger.info(f"     공유: {post.get('shares', 0):,}")
                        logger.info(f"     조회수: {post.get('views', 0):,}")
                        logger.info(f"     댓글 수집: {len(post.get('comments', []))}개")
                else:
                    logger.error(f"❌ 실패: @{influencer_id}")
                
                # 요청 간 지연
                await asyncio.sleep(5)
                
            except Exception as e:
                logger.error(f"❌ 오류: @{influencer_id} - {e}")
                continue
        
        # 최종 결과 출력
        logger.info(f"\n{'='*50}")
        logger.info("=== 테스트 결과 요약 ===")
        logger.info(f"{'='*50}")
        logger.info(f"총 테스트: {len(test_influencers)}개")
        logger.info(f"성공: {len(all_results)}개")
        logger.info(f"실패: {len(test_influencers) - len(all_results)}개")
        
        if all_results:
            # 결과를 JSON 파일로 저장
            with open("post_test_results.json", "w", encoding="utf-8") as f:
                json.dump(all_results, f, ensure_ascii=False, indent=2)
            logger.info("결과가 post_test_results.json 파일에 저장되었습니다.")
        
        return all_results
        
    except Exception as e:
        logger.error(f"테스트 실패: {e}")
        return {}
        
    finally:
        if scraper:
            await scraper.cleanup()

async def main():
    """메인 함수"""
    try:
        results = await test_post_scraper()
        
        if results:
            print("\n" + "="*50)
            print("🎉 게시물 스크래핑 테스트 완료!")
            print("="*50)
            
            for influencer_id, posts in results.items():
                print(f"\n@{influencer_id}:")
                print(f"  게시물: {len(posts)}개")
                
                total_hearts = sum(post.get('hearts', 0) for post in posts)
                total_comments = sum(post.get('comment_count', 0) for post in posts)
                total_shares = sum(post.get('shares', 0) for post in posts)
                total_views = sum(post.get('views', 0) for post in posts)
                
                print(f"  총 좋아요: {total_hearts:,}")
                print(f"  총 댓글: {total_comments:,}")
                print(f"  총 공유: {total_shares:,}")
                print(f"  총 조회수: {total_views:,}")
                
                # 댓글 샘플 출력
                for i, post in enumerate(posts[:2], 1):  # 처음 2개 게시물만
                    comments = post.get('comments', [])
                    if comments:
                        print(f"  게시물 {i} 댓글 샘플:")
                        for j, comment in enumerate(comments[:3], 1):  # 처음 3개 댓글만
                            print(f"    {j}. {comment.get('author', 'Unknown')}: {comment.get('text', '')[:50]}...")
        else:
            print("\n❌ 테스트 실패 - 데이터를 수집할 수 없었습니다.")
            
    except KeyboardInterrupt:
        print("\n\n⏹️  사용자에 의해 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 예상치 못한 오류: {e}")

if __name__ == "__main__":
    asyncio.run(main()) 