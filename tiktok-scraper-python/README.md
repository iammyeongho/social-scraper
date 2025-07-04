# TikTok Scraper Python

Node.js 기반 TikTok 스크래퍼를 Python으로 변환한 버전입니다. Playwright를 사용하여 TikTok 인플루언서의 프로필, 게시물, 팔로워, 댓글 데이터를 수집하고 PostgreSQL 데이터베이스에 저장합니다.

## 🚀 주요 특징

- **Playwright 기반**: 최신 웹 브라우저 자동화 기술 사용
- **비동기 처리**: asyncio를 활용한 고성능 비동기 스크래핑
- **스트림 처리**: 실시간으로 데이터를 수집하고 즉시 저장
- **성능 추적**: 상세한 성능 모니터링 및 통계 수집
- **확장 가능**: 모듈화된 구조로 쉬운 확장 및 유지보수
- **에러 복구**: 강력한 에러 처리 및 재시도 메커니즘

## 📋 요구사항

- Python 3.8+
- PostgreSQL 12+
- Playwright

## 🛠️ 설치

### 1. 저장소 클론
```bash
git clone <repository-url>
cd tiktok-scraper-python
```

### 2. 가상환경 생성 및 활성화
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 또는
venv\Scripts\activate  # Windows
```

### 3. 의존성 설치
```bash
pip install -r requirements.txt
```

### 4. Playwright 브라우저 설치
```bash
playwright install chromium
```

### 5. 환경변수 설정
```bash
cp .env.example .env
# .env 파일을 편집하여 설정값 입력
```

## ⚙️ 설정

### 환경변수 (.env)

```env
# 데이터베이스 설정
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tiktok_scraper
DB_USER=postgres
DB_PASSWORD=your_password

# API 설정
INFLUENCER_API_URL=https://api.example.com/influencers
INFLUENCER_API_KEY=your_api_key
RESULT_API_URL=https://api.example.com/results
RESULT_API_KEY=your_api_key

# API 사용 여부 (false면 테스트 목록 사용)
USE_API=false

# 테스트용 인플루언서 목록 (API 연동 전 사용)
# TEST_INFLUENCER_IDS=["charlidamelio", "bellapoarch", "addisonre", "zachking", "spencerx"]

# TikTok 스크래핑 설정
TIKTOK_HEADLESS=true
TIKTOK_SLOW_MO=100
TIKTOK_MAX_POSTS_PER_INFLUENCER=100
TIKTOK_MAX_FOLLOWERS_PER_INFLUENCER=500
TIKTOK_MAX_COMMENTS_PER_POST=200

# 성능 설정
MAX_CONCURRENT_TASKS=3
REQUEST_DELAY=2.0
MAX_RETRIES=3
```

### 설정 파일 구조

```
config/
├── __init__.py
├── base.py          # 기본 설정
├── database.py      # 데이터베이스 설정
├── api.py          # API 설정
├── tiktok.py       # TikTok 스크래핑 설정
└── settings.py     # 통합 설정
```

## 🏗️ 프로젝트 구조

```
tiktok-scraper-python/
├── main.py                 # 메인 진입점
├── requirements.txt        # Python 의존성
├── .env.example           # 환경변수 예시
├── README.md              # 프로젝트 문서
├── config/                # 설정 파일들
│   ├── __init__.py
│   ├── base.py
│   ├── database.py
│   ├── api.py
│   ├── tiktok.py
│   └── settings.py
├── services/              # 핵심 서비스들
│   ├── __init__.py
│   ├── database_service.py
│   ├── api_client.py
│   ├── performance_tracker.py
│   └── tiktok_scraper.py
├── scrapers/              # 개별 스크래퍼들
│   ├── __init__.py
│   ├── base_scraper.py
│   ├── tiktok_profile_scraper.py
│   ├── tiktok_post_scraper.py
│   ├── tiktok_follower_scraper.py
│   └── tiktok_comment_scraper.py
├── logs/                  # 로그 파일들
├── screenshots/           # 스크린샷 파일들
└── output/                # 출력 파일들
```

## 🚀 사용법

### 기본 실행
```bash
python main.py
```

### 개발 모드 실행
```bash
# 헤드리스 모드 비활성화
export TIKTOK_HEADLESS=false
python main.py
```

### 테스트 모드 실행 (API 없이)
```bash
# 환경변수에서 API 사용 비활성화
export USE_API=false
python main.py
```

### 커스텀 인플루언서 목록 사용
```bash
# 환경변수에서 테스트용 인플루언서 목록 설정
export TEST_INFLUENCER_IDS='["your_influencer1", "your_influencer2", "your_influencer3"]'
export USE_API=false
python main.py
```

### 설정 확인
```bash
python -c "from config.settings import settings; settings.print_config()"
```

## 📊 데이터베이스 스키마

### 핵심 테이블들

#### tiktok_influencer
- 인플루언서 프로필 정보
- TikTok ID, 사용자명, 설명, 통계 등

#### tiktok_post
- 게시물 정보
- 게시물 ID, URL, 통계, 내용 등

#### tiktok_followers
- 팔로워 정보
- 팔로워 사용자명, 프로필 정보 등

#### tiktok_comments
- 댓글 정보
- 댓글 내용, 작성자, 통계 등

#### tiktok_scraping_sessions
- 스크래핑 세션 정보
- 성능 추적 및 모니터링

#### tiktok_scraping_logs
- 스크래핑 로그
- 작업 진행 상황 및 결과

## 🔧 주요 컴포넌트

### TikTokScrapingSystem (main.py)
- 전체 시스템의 진입점 및 조율자
- 시스템 초기화, 스크래핑 프로세스 실행

### TikTokScraper (services/tiktok_scraper.py)
- 메인 스크래핑 로직 관리
- 인플루언서 큐 관리, 개별 스크래퍼 조율

### DatabaseService (services/database_service.py)
- PostgreSQL 데이터베이스 관리
- 데이터 저장, 쿼리 실행, 성능 최적화

### PerformanceTracker (services/performance_tracker.py)
- 성능 모니터링 및 통계 수집
- 작업 진행 상황 추적

### 개별 스크래퍼들 (scrapers/)
- **TikTokProfileScraper**: 인플루언서 프로필 정보 수집
- **TikTokPostScraper**: 게시물 목록 및 상세 정보 수집
- **TikTokFollowerScraper**: 팔로워 목록 수집
- **TikTokCommentScraper**: 게시물 댓글 수집

## 📈 성능 최적화

### 비동기 처리
- asyncio를 활용한 동시 처리
- 세마포어를 통한 동시 작업 수 제한

### 스트림 처리
- 실시간 데이터 수집 및 저장
- 메모리 사용량 최적화

### 재시도 메커니즘
- tenacity 라이브러리를 활용한 지능적 재시도
- 지수 백오프 전략

### 캐싱
- 데이터베이스 연결 풀
- 중복 데이터 처리 최적화

## 🛡️ 에러 처리

### 캡차 처리
- 캡차 감지 및 수동 개입 대기
- 스크린샷 촬영으로 상황 기록

### 속도 제한 처리
- 요청 간 지연 시간 조정
- 자동 대기 및 재시도

### 네트워크 오류
- 연결 타임아웃 설정
- 재연결 시도

## 📝 로깅

### 로그 레벨
- DEBUG: 상세한 디버깅 정보
- INFO: 일반적인 진행 상황
- WARNING: 경고 메시지
- ERROR: 오류 메시지

### 로그 파일
- 자동 로테이션 (10MB 단위)
- 7일간 보관
- 구조화된 로그 형식

## 🔍 모니터링

### 성능 지표
- 작업별 소요 시간
- 처리된 아이템 수
- 오류 발생률
- 재시도 횟수

### 실시간 모니터링
- 진행 상황 추적
- 성능 통계 수집
- 시스템 상태 확인

## 🚨 주의사항

### 법적 고려사항
- TikTok의 이용약관 준수
- 개인정보 보호법 준수
- 적절한 요청 빈도 유지

### 기술적 고려사항
- TikTok UI 변경에 대응
- IP 차단 방지
- 안정적인 네트워크 환경

## 🤝 기여

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 라이선스

MIT License

## 📞 지원

문제가 발생하거나 질문이 있으시면 이슈를 생성해 주세요.

---

**참고**: 이 프로젝트는 교육 및 연구 목적으로 제작되었습니다. 상업적 사용 시 관련 법규를 준수해 주세요. 