#!/usr/bin/env python3
"""
TikTok 스크래퍼 테스트 스크립트
"""
import asyncio
import json
from loguru import logger
from scrapers.tiktok_profile_scraper import TikTokProfileScraper
from config.settings import settings

async def test_profile_scraper():
    """프로필 스크래퍼 테스트"""
    scraper = None
    try:
        logger.info("=== TikTok 프로필 스크래퍼 테스트 시작 ===")
        
        # 스크래퍼 초기화
        scraper = TikTokProfileScraper(config=settings)
        await scraper.initialize()
        
        # 테스트할 인플루언서 목록
        test_influencers = [
            "at_chaeunwoo",  # 기존 테스트 계정
            "charlidamelio",  # 유명한 TikToker
            "bellapoarch",    # 또 다른 유명 TikToker
        ]
        
        results = []
        
        for influencer_id in test_influencers:
            try:
                logger.info(f"\n{'='*50}")
                logger.info(f"테스트 중: @{influencer_id}")
                logger.info(f"{'='*50}")
                
                # 프로필 스크래핑
                profile_data = await scraper.scrape_profile(influencer_id)
                
                if profile_data:
                    results.append(profile_data)
                    
                    # 결과 출력
                    logger.info(f"✅ 성공: @{influencer_id}")
                    logger.info(f"   사용자명: {profile_data.get('tiktok_name', 'N/A')}")
                    logger.info(f"   팔로워: {profile_data.get('followers', 0):,}")
                    logger.info(f"   팔로잉: {profile_data.get('following', 0):,}")
                    logger.info(f"   좋아요: {profile_data.get('hearts', 0):,}")
                    logger.info(f"   비디오: {profile_data.get('videos', 0):,}")
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
        logger.info(f"성공: {len(results)}개")
        logger.info(f"실패: {len(test_influencers) - len(results)}개")
        
        if results:
            # 결과를 JSON 파일로 저장
            with open("test_results.json", "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            logger.info("결과가 test_results.json 파일에 저장되었습니다.")
        
        return results
        
    except Exception as e:
        logger.error(f"테스트 실패: {e}")
        return []
        
    finally:
        if scraper:
            await scraper.cleanup()

async def main():
    """메인 함수"""
    try:
        results = await test_profile_scraper()
        
        if results:
            print("\n" + "="*50)
            print("🎉 테스트 완료! 수집된 데이터:")
            print("="*50)
            
            for i, profile in enumerate(results, 1):
                print(f"\n{i}. @{profile.get('tiktok_id', 'unknown')}")
                print(f"   사용자명: {profile.get('tiktok_name', 'N/A')}")
                print(f"   팔로워: {profile.get('followers', 0):,}")
                print(f"   팔로잉: {profile.get('following', 0):,}")
                print(f"   좋아요: {profile.get('hearts', 0):,}")
                print(f"   비디오: {profile.get('videos', 0):,}")
        else:
            print("\n❌ 테스트 실패 - 데이터를 수집할 수 없었습니다.")
            
    except KeyboardInterrupt:
        print("\n\n⏹️  사용자에 의해 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 예상치 못한 오류: {e}")

if __name__ == "__main__":
    asyncio.run(main()) 