# TikTok 스크래핑 시스템 아키텍처 및 프로세스

## 📋 목차
1. [시스템 개요](#시스템-개요)
2. [디렉토리 구조](#디렉토리-구조)
3. [핵심 컴포넌트](#핵심-컴포넌트)
4. [데이터베이스 스키마](#데이터베이스-스키마)
5. [스크래핑 프로세스](#스크래핑-프로세스)
6. [성능 최적화](#성능-최적화)
7. [에러 처리](#에러-처리)
8. [모니터링 및 로깅](#모니터링-및-로깅)

## 🎯 시스템 개요

TikTok 스크래핑 시스템은 TikTok 인플루언서의 프로필, 게시물, 팔로워, 댓글 데이터를 수집하고 PostgreSQL 데이터베이스에 저장하는 Node.js 기반 시스템입니다.

### 주요 특징
- **스트림 처리**: 실시간으로 데이터를 수집하고 즉시 저장
- **성능 추적**: 상세한 성능 모니터링 및 통계 수집
- **확장 가능**: 모듈화된 구조로 쉬운 확장 및 유지보수
- **에러 복구**: 강력한 에러 처리 및 재시도 메커니즘

## 📁 디렉토리 구조

```
tiktok-scraper/
├── main.js                 # 메인 진입점
├── config/                 # 설정 파일들
│   ├── index.js           # 설정 통합
│   ├── database.js        # 데이터베이스 설정
│   ├── api.js             # API 설정
│   └── tiktok.js          # TikTok 스크래핑 설정
├── services/              # 핵심 서비스들
│   ├── tiktok_scraper.js  # 메인 스크래핑 서비스
│   ├── database_service.js # 데이터베이스 서비스
│   ├── performance_tracker.js # 성능 추적 서비스
│   └── api_client.js      # API 클라이언트
├── scrapers/              # 개별 스크래퍼들
│   ├── tiktok_profile_scraper.js    # 프로필 스크래퍼
│   ├── tiktok_post_scraper.js       # 게시물 스크래퍼
│   ├── tiktok_follower_scraper.js   # 팔로워 스크래퍼
│   └── tiktok_comment_scraper.js    # 댓글 스크래퍼
├── scripts/               # 유틸리티 스크립트
├── output/                # 출력 파일들
├── logs/                  # 로그 파일들
└── ecosystem.config.js    # PM2 설정
```

## 🔧 핵심 컴포넌트

### 1. TikTokScrapingSystem (main.js)
- **역할**: 전체 시스템의 진입점 및 조율자
- **주요 기능**:
  - 시스템 초기화 (API, DB 연결)
  - 인플루언서 ID 목록 수집
  - 스크래핑 프로세스 실행
  - 결과 분석 및 저장

### 2. TikTokScraper (services/tiktok_scraper.js)
- **역할**: 메인 스크래핑 로직 관리
- **주요 기능**:
  - 인플루언서 큐 관리
  - 개별 스크래퍼 조율
  - 스트림 처리 구현
  - 데이터 변환 및 저장

### 3. DatabaseService (services/database_service.js)
- **역할**: PostgreSQL 데이터베이스 관리
- **주요 기능**:
  - 데이터베이스 연결 및 쿼리 실행
  - 테이블 생성 및 스키마 관리
  - 데이터 저장 및 업데이트
  - 성능 최적화된 배치 처리

### 4. PerformanceTracker (services/performance_tracker.js)
- **역할**: 성능 모니터링 및 통계 수집
- **주요 기능**:
  - 스크래핑 세션 관리
  - 작업 진행 상황 추적
  - 성능 통계 수집
  - 설정값 관리

### 5. 개별 스크래퍼들 (scrapers/)
- **TikTokProfileScraper**: 인플루언서 프로필 정보 수집
- **TikTokPostScraper**: 게시물 목록 및 상세 정보 수집
- **TikTokFollowerScraper**: 팔로워 목록 수집
- **TikTokCommentScraper**: 게시물 댓글 수집

## 🗄️ 데이터베이스 스키마

### 핵심 테이블들

#### 1. tiktok_influencer
```sql
- id: BIGSERIAL PRIMARY KEY
- tiktok_id: VARCHAR(255) UNIQUE NOT NULL
- tiktok_name: VARCHAR(255)
- profile_url: VARCHAR(500)
- description: TEXT
- is_verified: BOOLEAN DEFAULT FALSE
- following: BIGINT DEFAULT 0
- followers: BIGINT DEFAULT 0
- engage_rate: DECIMAL(5,2)
- hearts: BIGINT DEFAULT 0
- videos: INTEGER DEFAULT 0
- category: VARCHAR(100)
- country: VARCHAR(100)
- created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- updated_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

#### 2. tiktok_post
```sql
- id: BIGSERIAL PRIMARY KEY
- influencer_id: BIGINT NOT NULL (FK)
- post_id: VARCHAR(255) UNIQUE
- post_url: VARCHAR(500)
- hearts: BIGINT DEFAULT 0
- shares: BIGINT DEFAULT 0
- comments: BIGINT DEFAULT 0
- plays: BIGINT DEFAULT 0
- hashtags: TEXT
- content: TEXT
- video_url: VARCHAR(500)
- upload_date: TIMESTAMP
- scraped_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- raw_data: JSONB
```

#### 3. tiktok_followers
```sql
- id: BIGSERIAL PRIMARY KEY
- influencer_id: BIGINT NOT NULL (FK)
- follower_username: VARCHAR(255) NOT NULL
- follower_display_name: VARCHAR(255)
- follower_avatar_url: VARCHAR(500)
- is_verified: BOOLEAN DEFAULT FALSE
- follower_count: BIGINT DEFAULT 0
- following_count: BIGINT DEFAULT 0
- discovered_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- scraped_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- raw_data: JSONB
```

#### 4. tiktok_comments
```sql
- id: BIGSERIAL PRIMARY KEY
- post_id: BIGINT NOT NULL (FK)
- comment_id: VARCHAR(255) UNIQUE
- user_name: VARCHAR(255)
- display_name: VARCHAR(255)
- scraped_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### 성능 추적 테이블들

#### 5. tiktok_scraping_sessions
```sql
- id: BIGSERIAL PRIMARY KEY
- session_name: VARCHAR(255)
- session_start_time: TIMESTAMP
- session_end_time: TIMESTAMP
- total_duration_seconds: INTEGER
- completed_tasks: INTEGER DEFAULT 0
- total_items_collected: INTEGER DEFAULT 0
- status: VARCHAR(50) DEFAULT 'active'
- config_snapshot: JSONB
```

#### 6. tiktok_scraping_config
```sql
- id: BIGSERIAL PRIMARY KEY
- config_key: VARCHAR(100) UNIQUE NOT NULL
- config_value: TEXT
- config_type: VARCHAR(50)
- description: TEXT
- is_active: BOOLEAN DEFAULT TRUE
```

## 🔄 스크래핑 프로세스

### 1. 시스템 초기화
```mermaid
graph TD
    A[main.js 시작] --> B[API 상태 확인]
    B --> C[데이터베이스 연결]
    C --> D[PerformanceTracker 초기화]
    D --> E[스크래퍼들 초기화]
    E --> F[스크래핑 세션 시작]
```

### 2. 인플루언서 처리 플로우
```mermaid
graph TD
    A[인플루언서 ID 큐에서 추출] --> B[프로필 정보 수집]
    B --> C[프로필 즉시 저장]
    C --> D[게시물 URL 목록 수집]
    D --> E[게시물 하나씩 처리 + 저장]
    E --> F[팔로워 수집 + 저장]
    F --> G[게시물 상세 정보 수집 + 업데이트]
    G --> H[댓글 수집 + 저장]
    H --> I[다음 인플루언서 처리]
```

### 3. 스트림 처리 방식
- **기존 배치 처리**: 모든 데이터 수집 후 한 번에 저장
- **새로운 스트림 처리**: 데이터 수집과 동시에 즉시 저장
- **장점**: 메모리 사용량 감소, 실시간 진행 상황 확인, 에러 복구 용이

### 4. 데이터 수집 단계

#### 4.1 프로필 수집
1. TikTok API를 통한 프로필 정보 수집
2. 기본 정보 (팔로워 수, 게시물 수, 인증 여부 등)
3. 프로필 이미지 URL, 설명 등
4. 즉시 데이터베이스에 저장

#### 4.2 게시물 수집
1. 프로필에서 게시물 URL 목록 수집
2. 각 게시물의 기본 정보 (좋아요, 댓글, 조회수 등)
3. 게시물별로 즉시 저장
4. 설정에 따라 상세 정보 추가 수집

#### 4.3 팔로워 수집
1. 설정에 따라 활성화/비활성화
2. 팔로워 목록 수집 (최대 1000명)
3. 팔로워별 기본 정보 수집
4. 배치로 데이터베이스에 저장

#### 4.4 댓글 수집
1. 설정에 따라 활성화/비활성화
2. 최근 게시물 3개에서 댓글 수집
3. 댓글 작성자 정보 수집
4. 게시물별로 댓글 저장

## ⚡ 성능 최적화

### 1. 데이터베이스 최적화
- **인덱스 생성**: 자주 조회되는 컬럼에 인덱스 설정
- **배치 처리**: 대량 데이터는 배치 INSERT 사용
- **연결 풀링**: PostgreSQL 연결 풀 사용
- **쿼리 최적화**: 효율적인 SQL 쿼리 작성

### 2. 스크래핑 최적화
- **딜레이 설정**: 요청 간 적절한 딜레이로 차단 방지
- **병렬 처리**: 가능한 경우 병렬로 데이터 수집
- **스트림 처리**: 메모리 사용량 최소화
- **에러 재시도**: 실패한 요청에 대한 재시도 로직

### 3. 설정 기반 최적화
```javascript
// config/tiktok.js
{
  scraping: {
    enableFollowerScraping: true,
    enablePostDetailScraping: true,
    enableCommentScraping: true,
    maxFollowersPerInfluencer: 1000,
    maxCommentsPerPost: 500,
    maxPostsPerInfluencer: 50,
    scrapingDelayMs: 2000,
    maxRetryAttempts: 3
  }
}
```

## 🛡️ 에러 처리

### 1. 네트워크 에러
- **재시도 로직**: 설정된 횟수만큼 재시도
- **점진적 딜레이**: 재시도 시 딜레이 증가
- **에러 로깅**: 상세한 에러 정보 기록

### 2. 데이터베이스 에러
- **연결 재시도**: DB 연결 실패 시 재연결
- **트랜잭션 롤백**: 에러 발생 시 롤백
- **데이터 검증**: 저장 전 데이터 유효성 검사

### 3. API 제한
- **요청 제한 감지**: 429 에러 등 제한 감지
- **동적 딜레이**: 제한 시 딜레이 증가
- **대체 방법**: API 실패 시 대체 수집 방법 사용

## 📊 모니터링 및 로깅

### 1. 성능 추적
- **세션 관리**: 스크래핑 세션별 통계
- **작업 추적**: 개별 작업 진행 상황
- **성능 지표**: 처리 속도, 성공률 등

### 2. 로깅 시스템
- **구조화된 로그**: JSON 형태의 구조화된 로그
- **로그 레벨**: DEBUG, INFO, WARN, ERROR
- **로그 파일**: 날짜별 로그 파일 생성

### 3. 모니터링 지표
- **처리된 인플루언서 수**
- **수집된 데이터 양**
- **성공/실패 비율**
- **처리 시간**
- **메모리 사용량**

## 🚀 배포 및 운영

### 1. PM2 설정
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'tiktok-scraper',
    script: 'main.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
```

### 2. 환경 변수
```bash
# .env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:port/db
API_BASE_URL=https://api.example.com
API_KEY=your_api_key
```

### 3. 실행 명령어
```bash
# 개발 환경
npm start

# 프로덕션 환경
pm2 start ecosystem.config.js

# 로그 확인
pm2 logs tiktok-scraper

# 상태 확인
pm2 status
```

## 🔧 설정 및 커스터마이징

### 1. 스크래핑 설정 조정
```javascript
// config/tiktok.js에서 조정 가능
{
  scraping: {
    enableFollowerScraping: true,    // 팔로워 수집 활성화
    enablePostDetailScraping: true,  // 게시물 상세 정보 수집
    enableCommentScraping: true,     // 댓글 수집 활성화
    maxFollowersPerInfluencer: 1000, // 인플루언서당 최대 팔로워 수
    maxCommentsPerPost: 500,         // 게시물당 최대 댓글 수
    maxPostsPerInfluencer: 50,       // 인플루언서당 최대 게시물 수
    scrapingDelayMs: 2000,           // 요청 간 딜레이 (ms)
    maxRetryAttempts: 3              // 최대 재시도 횟수
  }
}
```

### 2. 데이터베이스 설정
```javascript
// config/database.js
module.exports = {
  postgres: {
    host: 'localhost',
    port: 5432,
    database: 'tiktok_scraper',
    user: 'username',
    password: 'password'
  },
  aws: {
    rds: {
      // AWS RDS 설정
    }
  }
}
```

이 문서는 TikTok 스크래핑 시스템의 전체적인 구조와 동작 방식을 설명합니다. 시스템을 이해하고 수정하거나 확장할 때 참고하시기 바랍니다. 