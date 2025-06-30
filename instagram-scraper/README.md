# Instagram Scraper

Instagram 인플루언서 데이터 수집 시스템

## 기능

- Instagram 인플루언서 프로필 정보 수집
- Instagram 게시물 상세 정보 수집
- PostgreSQL 데이터베이스 저장
- 서드파티 API 연동
- AWS 클라우드 배포 지원

## 설치

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일을 편집하여 실제 값으로 설정
```

## 사용법

### 개발 환경

```bash
# 일반 실행
npm start

# 개발 모드 (디버깅)
npm run dev

# 테스트
npm run test
```

### 프로덕션 환경 (PM2)

```bash
# PM2로 프로세스 시작
npm run pm2:start

# 프로세스 중지
npm run pm2:stop

# 프로세스 재시작
npm run pm2:restart

# 로그 확인
npm run pm2:logs
```

### 개별 스크래퍼 실행

```bash
# 프로필 스크래핑
npm run profile

# 게시물 스크래핑
npm run post

# 로그인 테스트
npm run login
```

## 설정

### 환경변수

- `NODE_ENV`: 실행 환경 (development/production)
- `INSTAGRAM_USERNAME`: Instagram 로그인 계정
- `INSTAGRAM_PASSWORD`: Instagram 로그인 비밀번호
- `DB_*`: 데이터베이스 연결 정보
- `API_*`: 서드파티 API 설정

### 데이터베이스

PostgreSQL 9.6 이상 권장

```sql
-- 데이터베이스 생성
CREATE DATABASE instagram_scraper;
```

## 프로젝트 구조

```
instagram-scraper/
├── config/           # 설정 파일들
├── scrapers/         # 스크래핑 모듈들
├── services/         # 핵심 서비스들
├── scripts/          # 유틸리티 스크립트들
├── output/           # 출력 파일들
├── logs/             # 로그 파일들
└── main.js           # 메인 실행 파일
```

## AWS 배포

자세한 AWS 배포 가이드는 `AWS_DEPLOYMENT.md` 파일을 참조하세요.

## 라이선스

MIT 