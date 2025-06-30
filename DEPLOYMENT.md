# AWS 배포 가이드

Instagram과 TikTok 스크래퍼를 AWS 클라우드에 배포하기 위한 가이드입니다.

## 프로젝트 분할 완료

✅ **Instagram 스크래퍼 프로젝트** (`instagram-scraper/`)
- 독립적인 Instagram 전용 스크래핑 시스템
- PostgreSQL 데이터베이스 연동
- PM2 프로세스 관리
- AWS 배포 준비 완료

✅ **TikTok 스크래퍼 프로젝트** (`tiktok-scraper/`)
- 독립적인 TikTok 전용 스크래핑 시스템
- PostgreSQL 데이터베이스 연동
- PM2 프로세스 관리
- AWS 배포 준비 완료

## 아키텍처 개요

```
┌─────────────────┐    ┌─────────────────┐
│  Instagram      │    │   TikTok        │
│  Scraper EC2    │    │   Scraper EC2   │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          └──────────┬───────────┘
                     │
          ┌─────────────────┐
          │   RDS           │
          │  PostgreSQL     │
          └─────────────────┘
```

## AWS 초기 설치 및 세팅

### 1. 사전 준비

#### AWS 계정 설정
```bash
# AWS CLI 설치 (Windows)
winget install Amazon.AWSCLI

# AWS 자격증명 설정
aws configure
```

#### 필수 정보 입력
- Access Key ID: IAM에서 생성한 액세스 키
- Secret Access Key: IAM에서 생성한 시크릿 키
- Default region: ap-northeast-2 (서울)
- Default output format: json

### 2. VPC 및 네트워크 설정

#### VPC 생성
```bash
# VPC 생성
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=scraper-vpc}]'

# 서브넷 생성 (퍼블릭 - EC2용)
aws ec2 create-subnet --vpc-id vpc-xxxxxxxx --cidr-block 10.0.1.0/24 --availability-zone ap-northeast-2a

# 서브넷 생성 (프라이빗 - RDS용)
aws ec2 create-subnet --vpc-id vpc-xxxxxxxx --cidr-block 10.0.2.0/24 --availability-zone ap-northeast-2a
aws ec2 create-subnet --vpc-id vpc-xxxxxxxx --cidr-block 10.0.3.0/24 --availability-zone ap-northeast-2c
```

#### 인터넷 게이트웨이 설정
```bash
# 인터넷 게이트웨이 생성
aws ec2 create-internet-gateway --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=scraper-igw}]'

# VPC에 연결
aws ec2 attach-internet-gateway --vpc-id vpc-xxxxxxxx --internet-gateway-id igw-xxxxxxxx
```

### 3. 보안 그룹 설정

#### EC2용 보안 그룹
```bash
# 보안 그룹 생성
aws ec2 create-security-group \
  --group-name scraper-ec2-sg \
  --description "Security group for scraper EC2 instances" \
  --vpc-id vpc-xxxxxxxx

# SSH 접근 허용 (본인 IP만)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp \
  --port 22 \
  --cidr [YOUR_IP]/32

# HTTP/HTTPS 아웃바운드 허용
aws ec2 authorize-security-group-egress \
  --group-id sg-xxxxxxxx \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-egress \
  --group-id sg-xxxxxxxx \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

#### RDS용 보안 그룹
```bash
# RDS 보안 그룹 생성
aws ec2 create-security-group \
  --group-name scraper-rds-sg \
  --description "Security group for RDS" \
  --vpc-id vpc-xxxxxxxx

# EC2에서 PostgreSQL 접근 허용
aws ec2 authorize-security-group-ingress \
  --group-id sg-rds-xxxxxxxx \
  --protocol tcp \
  --port 5432 \
  --source-group sg-xxxxxxxx
```

### 4. 데이터베이스 설정

#### RDS 서브넷 그룹 생성
```bash
aws rds create-db-subnet-group \
  --db-subnet-group-name scraper-subnet-group \
  --db-subnet-group-description "Subnet group for scraper databases" \
  --subnet-ids subnet-xxxxxxxx subnet-yyyyyyyy
```

#### PostgreSQL RDS 인스턴스 생성
```bash
aws rds create-db-instance \
  --db-instance-identifier scraper-postgres \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 13.7 \
  --master-username admin \
  --master-user-password 'YourSecurePassword123!' \
  --allocated-storage 20 \
  --storage-type gp2 \
  --vpc-security-group-ids sg-rds-xxxxxxxx \
  --db-subnet-group-name scraper-subnet-group \
  --backup-retention-period 7 \
  --storage-encrypted \
  --no-multi-az \
  --no-publicly-accessible
```

### 5. EC2 인스턴스 생성

#### Instagram 스크래퍼 인스턴스
```bash
aws ec2 run-instances \
  --image-id ami-0c6e5afdd23291f73 \
  --count 1 \
  --instance-type t3.small \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxxxxx \
  --subnet-id subnet-xxxxxxxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=Instagram-Scraper}]'
```

#### TikTok 스크래퍼 인스턴스
```bash
aws ec2 run-instances \
  --image-id ami-0c6e5afdd23291f73 \
  --count 1 \
  --instance-type t3.small \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxxxxx \
  --subnet-id subnet-xxxxxxxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=TikTok-Scraper}]'
```

## 애플리케이션 배포

### 1. 서버 초기 설정

#### 각 EC2 인스턴스에 SSH 접속 후 실행:
```bash
# 시스템 업데이트
sudo yum update -y

# Git 설치
sudo yum install -y git

# Node.js 18 설치
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# PM2 글로벌 설치
sudo npm install -g pm2

# 크롬 및 의존성 설치 (스크래핑용)
sudo yum install -y chromium
```

### 2. 코드 배포

#### Instagram 스크래퍼 배포 (Instagram EC2에서)
```bash
# 프로젝트 클론
git clone https://github.com/your-username/social-scraper.git
cd social-scraper/instagram-scraper

# 의존성 설치
npm install

# 환경변수 설정
nano .env
```

#### Instagram .env 설정
```env
NODE_ENV=production

# Database
DB_HOST=scraper-postgres.xxxxxxxx.ap-northeast-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=instagram_scraper
DB_USER=admin
DB_PASSWORD=YourSecurePassword123!

# API
USE_REAL_API=false
API_BASE_URL=https://your-api.com
API_KEY=your-api-key

# Instagram 계정 (스크래핑용)
INSTAGRAM_USERNAME=your_instagram_account
INSTAGRAM_PASSWORD=your_instagram_password

# AWS
AWS_REGION=ap-northeast-2
```

#### TikTok 스크래퍼 배포 (TikTok EC2에서)
```bash
# 프로젝트 클론
git clone https://github.com/your-username/social-scraper.git
cd social-scraper/tiktok-scraper

# 의존성 설치
npm install

# 환경변수 설정
nano .env
```

#### TikTok .env 설정
```env
NODE_ENV=production

# Database
DB_HOST=scraper-postgres.xxxxxxxx.ap-northeast-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=tiktok_scraper
DB_USER=admin
DB_PASSWORD=YourSecurePassword123!

# API
USE_REAL_API=false
API_BASE_URL=https://your-api.com
API_KEY=your-api-key

# AWS
AWS_REGION=ap-northeast-2
```

### 3. 데이터베이스 초기화

#### PostgreSQL에 연결하여 데이터베이스 생성
```bash
# EC2에서 PostgreSQL 클라이언트 설치
sudo yum install -y postgresql

# RDS에 연결
psql -h scraper-postgres.xxxxxxxx.ap-northeast-2.rds.amazonaws.com -U admin -d postgres
```

#### 데이터베이스 생성
```sql
-- Instagram 데이터베이스
CREATE DATABASE instagram_scraper;

-- TikTok 데이터베이스
CREATE DATABASE tiktok_scraper;

-- 연결 확인
\l
```

### 4. 서비스 시작

#### Instagram 스크래퍼 시작
```bash
cd /home/ec2-user/social-scraper/instagram-scraper

# PM2로 시작
pm2 start ecosystem.config.js --env production

# 부팅 시 자동 시작 설정
pm2 startup
pm2 save
```

#### TikTok 스크래퍼 시작
```bash
cd /home/ec2-user/social-scraper/tiktok-scraper

# PM2로 시작
pm2 start ecosystem.config.js --env production

# 부팅 시 자동 시작 설정
pm2 startup
pm2 save
```

## 모니터링 설정

### 1. CloudWatch 로그 설정

#### 로그 그룹 생성
```bash
# Instagram 스크래퍼 로그 그룹
aws logs create-log-group --log-group-name /aws/ec2/instagram-scraper

# TikTok 스크래퍼 로그 그룹
aws logs create-log-group --log-group-name /aws/ec2/tiktok-scraper
```

### 2. 알람 설정

#### CPU 사용률 알람
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "Instagram-Scraper-High-CPU" \
  --alarm-description "Instagram scraper high CPU usage" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=InstanceId,Value=i-instagram-instance-id
```

## 보안 강화

### 1. IAM 역할 생성

#### EC2용 IAM 역할
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:ap-northeast-2:*:log-group:/aws/ec2/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. 키 관리

#### SSH 키 보안
```bash
# SSH 키 권한 설정
chmod 400 your-key-pair.pem

# SSH 설정 파일에 호스트 추가
nano ~/.ssh/config
```

## 운영 및 유지보수

### 1. 정기 백업

#### RDS 스냅샷 생성
```bash
aws rds create-db-snapshot \
  --db-instance-identifier scraper-postgres \
  --db-snapshot-identifier scraper-backup-$(date +%Y%m%d)
```

### 2. 로그 확인

#### PM2 로그 모니터링
```bash
# 실시간 로그 확인
pm2 logs

# 특정 프로세스 로그
pm2 logs instagram-scraper
pm2 logs tiktok-scraper
```

#### CloudWatch 로그 확인
```bash
aws logs get-log-events \
  --log-group-name /aws/ec2/instagram-scraper \
  --log-stream-name your-stream-name
```

### 3. 성능 최적화

#### 인스턴스 사이즈 조정
```bash
# 인스턴스 중지
aws ec2 stop-instances --instance-ids i-xxxxxxxx

# 인스턴스 타입 변경
aws ec2 modify-instance-attribute \
  --instance-id i-xxxxxxxx \
  --instance-type Value=t3.medium

# 인스턴스 시작
aws ec2 start-instances --instance-ids i-xxxxxxxx
```

## 비용 관리

### 1. 리소스 태깅
```bash
# 모든 리소스에 태그 추가
aws ec2 create-tags \
  --resources i-xxxxxxxx \
  --tags Key=Project,Value=SocialScraper Key=Environment,Value=Production
```

### 2. 스팟 인스턴스 활용 (비용 절약)
```bash
# 스팟 인스턴스 요청
aws ec2 request-spot-instances \
  --spot-price "0.05" \
  --instance-count 1 \
  --type "one-time" \
  --launch-specification file://spot-launch-spec.json
```

## 문제 해결

### 1. 일반적인 문제

#### 연결 문제
- 보안 그룹 설정 확인
- VPC 라우팅 테이블 확인
- 인스턴스 상태 확인

#### 성능 문제
- CloudWatch 메트릭 확인
- 로그 분석
- 인스턴스 리소스 모니터링

### 2. 긴급 대응

#### 서비스 재시작
```bash
# PM2 프로세스 재시작
pm2 restart all

# 특정 프로세스 재시작
pm2 restart instagram-scraper
```

## 마무리

이 가이드를 통해 Instagram과 TikTok 스크래퍼를 AWS에 성공적으로 분할 배포할 수 있습니다.

### 배포 후 체크리스트
- [ ] 두 프로젝트 모두 정상 실행 확인
- [ ] 데이터베이스 연결 확인
- [ ] PM2 프로세스 상태 확인
- [ ] CloudWatch 모니터링 설정
- [ ] 보안 그룹 및 IAM 권한 확인
- [ ] 백업 정책 설정

### 주의사항
⚠️ **중요**: 스크래핑 시 각 플랫폼의 이용약관을 준수하고, 적절한 딜레이를 설정하여 서버 부하를 방지하세요. 