# Social Scraper

소셜 미디어 인플루언서 데이터 수집 시스템

## 프로젝트 구조

```
social-scraper/
├── config/                 # 설정 파일들
│   ├── index.js           # 메인 설정
│   ├── instagram.js       # 인스타그램 설정
│   ├── tiktok.js          # 틱톡 설정
│   ├── database.js        # 데이터베이스 설정
│   └── api.js             # API 설정
├── services/              # 핵심 서비스들
│   ├── influencer_scraper.js    # 인플루언서 스크래핑 메인 서비스
│   ├── api_client.js            # 서드파티 API 클라이언트
│   └── database_service.js      # 데이터베이스 서비스
├── instagram/             # 인스타그램 스크래핑 모듈
│   ├── instagram_login.js
│   ├── instagram_post_scraper.js
│   └── instagram_profile_scraper.js
├── tiktok/                # 틱톡 스크래핑 모듈
├── scripts/               # 유틸리티 스크립트
│   └── test_system.js     # 시스템 테스트
├── main.js                # 메인 실행 파일
├── package.json
└── README.md
```

## 시스템 아키텍처

### 운영 서버와 스크래핑 서버 구조

1. **운영 서버**: 서드파티 API에서 인플루언서 ID 목록을 받아옴
2. **스크래핑 서버**: 받은 ID를 기반으로 순차적으로 스크래핑 실행
3. **데이터베이스**: 프로필과 게시물 데이터를 각각 별도 테이블에 저장

### 데이터 흐름

```
서드파티 API → API 클라이언트 → 인플루언서 스크래퍼 → 데이터베이스 서비스
```

## 주요 기능

### 1. 인플루언서 스크래핑 (`services/influencer_scraper.js`)
- 서드파티 API에서 받은 인플루언서 ID를 큐에 추가
- 순차적으로 인플루언서 프로필 및 게시물 스크래핑
- 기존 스크래핑 코드와 연동

### 2. API 클라이언트 (`services/api_client.js`)
- 서드파티 API와 통신
- 인플루언서 ID 목록 및 상세 정보 수집
- API 상태 확인

### 3. 데이터베이스 서비스 (`services/database_service.js`)
- 프로필과 게시물 데이터를 각각 별도 테이블에 저장
- 내부 ID와 API 인플루언서 ID 분리 관리
- 트랜잭션 처리 및 에러 핸들링

## 데이터베이스 설계

### 인플루언서 프로필 테이블
```sql
CREATE TABLE influencer_profiles (
    internal_id INT AUTO_INCREMENT PRIMARY KEY,
    api_influencer_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255),
    bio TEXT,
    followers_count INT,
    following_count INT,
    posts_count INT,
    profile_image_url TEXT,
    is_verified BOOLEAN,
    is_private BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 인플루언서 게시물 테이블
```sql
CREATE TABLE influencer_posts (
    internal_id INT AUTO_INCREMENT PRIMARY KEY,
    profile_internal_id INT,
    post_url VARCHAR(500) UNIQUE NOT NULL,
    post_type ENUM('p', 'reel', 'tv'),
    content TEXT,
    hashtags JSON,
    mentions JSON,
    tagged_users JSON,
    location VARCHAR(255),
    like_count INT,
    comment_count INT,
    upload_date DATETIME,
    media_type VARCHAR(50),
    thumbnail_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_internal_id) REFERENCES influencer_profiles(internal_id)
);
```

## 설정

### 환경 변수
```bash
# 데이터베이스 설정
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=social_scraper

# API 설정
API_BASE_URL=https://api.example.com
API_KEY=your_api_key_here
```

## 사용법

### 1. 시스템 테스트
```bash
node scripts/test_system.js
```

### 2. 전체 스크래핑 실행
```bash
node main.js
```

### 3. 개별 서비스 사용
```javascript
const InfluencerScraper = require('./services/influencer_scraper');
const ApiClient = require('./services/api_client');
const DatabaseService = require('./services/database_service');

// API 클라이언트로 인플루언서 ID 받아오기
const apiClient = new ApiClient(apiConfig);
const influencerIds = await apiClient.getInfluencerIds();

// 스크래핑 실행
const scraper = new InfluencerScraper();
scraper.addInfluencersToQueue(influencerIds);
const results = await scraper.processAllInfluencers();

// 데이터베이스에 저장
const dbService = new DatabaseService(dbConfig);
await dbService.connect();
for (const result of results) {
    await dbService.saveInfluencerData(result);
}
```

## 기존 스크래핑 코드 연동

기존의 `instagram_post_scraper.js`와 `instagram_profile_scraper.js`는 그대로 유지되며, 새로운 구조에서는 다음과 같이 연동됩니다:

1. `InfluencerScraper`에서 기존 스크래핑 함수들을 호출
2. 스크래핑 결과를 새로운 데이터 구조로 변환
3. `DatabaseService`를 통해 데이터베이스에 저장

## 개발 계획

- [ ] 실제 데이터베이스 연결 구현 (MySQL/PostgreSQL)
- [ ] 실제 서드파티 API 연동
- [ ] 기존 스크래핑 코드와의 완전한 연동
- [ ] 에러 처리 및 재시도 로직 강화
- [ ] 로깅 시스템 구현
- [ ] 모니터링 대시보드 구축

## 라이선스

MIT License 