# AWS 배포 가이드

Instagram과 TikTok 스크래퍼를 AWS 클라우드에 배포하기 위한 완전한 가이드입니다.

## 목차

1. [아키텍처 개요](#아키텍처-개요)
2. [사전 준비사항](#사전-준비사항)
3. [AWS 서비스 설정](#aws-서비스-설정)
4. [데이터베이스 설정](#데이터베이스-설정)
5. [애플리케이션 배포](#애플리케이션-배포)
6. [모니터링 및 로깅](#모니터링-및-로깅)
7. [보안 설정](#보안-설정)
8. [비용 최적화](#비용-최적화)

## 아키텍처 개요

```
┌─────────────────┐    ┌─────────────────┐
│  Instagram      │    │   TikTok        │
│  Scraper EC2    │    │   Scraper EC2   │
│                 │    │                 │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          └──────────┬───────────┘
                     │
          ┌─────────────────┐
          │   RDS           │
          │  PostgreSQL     │
          └─────────────────┘
                     │
          ┌─────────────────┐
          │  API Gateway    │
          │  + Lambda       │
          └─────────────────┘
                     │
          ┌─────────────────┐
          │   CloudWatch    │
          │  Monitoring     │
          └─────────────────┘
```

## 사전 준비사항

### 1. AWS 계정 준비
- AWS 계정 생성 및 결제 정보 등록
- IAM 사용자 생성 및 권한 설정
- AWS CLI 설치 및 구성

### 2. 도메인 및 SSL 인증서 (선택사항)
- Route 53을 통한 도메인 등록
- ACM을 통한 SSL 인증서 발급

### 3. 로컬 개발 환경
- Node.js 16+ 설치
- Docker 설치 (선택사항)
- Git 설치

## AWS 서비스 설정

### 1. VPC 설정

#### VPC 생성
```bash
# AWS CLI를 통한 VPC 생성
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=scraper-vpc}]'
```

#### 서브넷 생성
```bash
# 퍼블릭 서브넷 (EC2용)
aws ec2 create-subnet --vpc-id vpc-xxxxx --cidr-block 10.0.1.0/24 --availability-zone ap-northeast-2a

# 프라이빗 서브넷 (RDS용)
aws ec2 create-subnet --vpc-id vpc-xxxxx --cidr-block 10.0.2.0/24 --availability-zone ap-northeast-2a
aws ec2 create-subnet --vpc-id vpc-xxxxx --cidr-block 10.0.3.0/24 --availability-zone ap-northeast-2c
```

### 2. 보안 그룹 설정

#### EC2 보안 그룹
```bash
# Instagram/TikTok 스크래퍼용 보안 그룹
aws ec2 create-security-group --group-name scraper-sg --description "Security group for scraper instances" --vpc-id vpc-xxxxx

# SSH 접근 허용 (본인 IP만)
aws ec2 authorize-security-group-ingress --group-id sg-xxxxx --protocol tcp --port 22 --cidr YOUR_IP/32

# HTTP/HTTPS 아웃바운드 허용
aws ec2 authorize-security-group-egress --group-id sg-xxxxx --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-egress --group-id sg-xxxxx --protocol tcp --port 443 --cidr 0.0.0.0/0
```

#### RDS 보안 그룹
```bash
# RDS용 보안 그룹
aws ec2 create-security-group --group-name rds-sg --description "Security group for RDS" --vpc-id vpc-xxxxx

# EC2에서 RDS 접근 허용
aws ec2 authorize-security-group-ingress --group-id sg-rds-xxxxx --protocol tcp --port 5432 --source-group sg-xxxxx
```

## 데이터베이스 설정

### 1. RDS PostgreSQL 인스턴스 생성

#### 서브넷 그룹 생성
```bash
aws rds create-db-subnet-group \
  --db-subnet-group-name scraper-subnet-group \
  --db-subnet-group-description "Subnet group for scraper DB" \
  --subnet-ids subnet-xxxxx subnet-yyyyy
```

#### RDS 인스턴스 생성
```bash
aws rds create-db-instance \
  --db-instance-identifier scraper-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 13.7 \
  --master-username scraperuser \
  --master-user-password 'YourSecurePassword123!' \
  --allocated-storage 20 \
  --storage-type gp2 \
  --vpc-security-group-ids sg-rds-xxxxx \
  --db-subnet-group-name scraper-subnet-group \
  --backup-retention-period 7 \
  --storage-encrypted \
  --no-multi-az \
  --no-publicly-accessible
```

### 2. 데이터베이스 초기 설정

```sql
-- PostgreSQL에 연결 후 실행
CREATE DATABASE instagram_scraper;
CREATE DATABASE tiktok_scraper;

-- 별도 사용자 생성 (권장)
CREATE USER instagram_user WITH PASSWORD 'instagram_password';
CREATE USER tiktok_user WITH PASSWORD 'tiktok_password';

GRANT ALL PRIVILEGES ON DATABASE instagram_scraper TO instagram_user;
GRANT ALL PRIVILEGES ON DATABASE tiktok_scraper TO tiktok_user;
```

## 애플리케이션 배포

### 1. EC2 인스턴스 생성

#### 인스턴스 시작
```bash
# Amazon Linux 2 AMI 사용
aws ec2 run-instances \
  --image-id ami-0c6e5afdd23291f73 \
  --count 2 \
  --instance-type t3.small \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxx \
  --subnet-id subnet-xxxxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=Instagram-Scraper}]'
```

### 2. 인스턴스 초기 설정

#### 기본 패키지 설치
```bash
# EC2에 SSH 접속 후 실행
sudo yum update -y
sudo yum install -y git docker

# Node.js 18 설치
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# PM2 글로벌 설치
sudo npm install -g pm2

# Docker 시작
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user
```

### 3. 애플리케이션 배포

#### Instagram 스크래퍼 배포
```bash
# 코드 클론
git clone https://github.com/your-repo/social-scraper.git
cd social-scraper/instagram-scraper

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
nano .env
```

#### 환경변수 설정 (.env)
```bash
NODE_ENV=production

# Database
DB_HOST=your-rds-endpoint.ap-northeast-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=instagram_scraper
DB_USER=instagram_user
DB_PASSWORD=instagram_password

# API
USE_REAL_API=true
API_BASE_URL=https://your-api.com
API_KEY=your-api-key

# AWS
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

#### PM2로 프로세스 시작
```bash
# Instagram 스크래퍼 시작
cd /home/ec2-user/social-scraper/instagram-scraper
pm2 start ecosystem.config.js --env production

# TikTok 스크래퍼 시작 (다른 인스턴스에서)
cd /home/ec2-user/social-scraper/tiktok-scraper
pm2 start ecosystem.config.js --env production

# PM2 프로세스 저장
pm2 save
pm2 startup
```

### 4. 로드 밸런서 설정 (선택사항)

#### Application Load Balancer 생성
```bash
# ALB 생성
aws elbv2 create-load-balancer \
  --name scraper-alb \
  --subnets subnet-xxxxx subnet-yyyyy \
  --security-groups sg-xxxxx

# 타겟 그룹 생성
aws elbv2 create-target-group \
  --name scraper-targets \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxxxx \
  --health-check-path /health
```

## 모니터링 및 로깅

### 1. CloudWatch 설정

#### 로그 그룹 생성
```bash
# Instagram 스크래퍼 로그 그룹
aws logs create-log-group --log-group-name /aws/ec2/instagram-scraper

# TikTok 스크래퍼 로그 그룹
aws logs create-log-group --log-group-name /aws/ec2/tiktok-scraper
```

#### CloudWatch Agent 설치
```bash
# EC2에서 실행
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
sudo rpm -U ./amazon-cloudwatch-agent.rpm
```

#### CloudWatch Agent 설정
```json
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/home/ec2-user/.pm2/logs/instagram-scraper-out.log",
            "log_group_name": "/aws/ec2/instagram-scraper",
            "log_stream_name": "{instance_id}-out"
          },
          {
            "file_path": "/home/ec2-user/.pm2/logs/instagram-scraper-error.log",
            "log_group_name": "/aws/ec2/instagram-scraper",
            "log_stream_name": "{instance_id}-error"
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "Scraper/EC2",
    "metrics_collected": {
      "cpu": {
        "measurement": ["cpu_usage_idle", "cpu_usage_iowait", "cpu_usage_user", "cpu_usage_system"],
        "metrics_collection_interval": 60
      },
      "mem": {
        "measurement": ["mem_used_percent"],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": ["used_percent"],
        "metrics_collection_interval": 60,
        "resources": ["*"]
      }
    }
  }
}
```

### 2. 알람 설정

#### CPU 사용률 알람
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "High-CPU-Usage" \
  --alarm-description "Alarm when CPU usage exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

## 보안 설정

### 1. IAM 역할 및 정책

#### EC2용 IAM 역할 생성
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "*"
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

### 2. SSL/TLS 설정

#### Let's Encrypt SSL 인증서 (무료)
```bash
# Certbot 설치
sudo yum install -y python3 python3-pip
sudo pip3 install certbot

# SSL 인증서 발급
sudo certbot certonly --standalone -d your-domain.com
```

### 3. 네트워크 보안

#### WAF 설정 (선택사항)
```bash
# WAF 웹 ACL 생성
aws wafv2 create-web-acl \
  --name scraper-waf \
  --scope REGIONAL \
  --default-action Allow={} \
  --rules file://waf-rules.json
```

## 스케줄링 및 자동화

### 1. CloudWatch Events를 통한 스케줄링

#### EventBridge 규칙 생성
```bash
# 매일 오전 9시 실행
aws events put-rule \
  --name scraper-daily-schedule \
  --schedule-expression "cron(0 9 * * ? *)" \
  --description "Daily scraper execution"
```

### 2. Lambda를 통한 트리거

#### Lambda 함수 생성
```javascript
// lambda-trigger.js
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

exports.handler = async (event) => {
    const command = {
        DocumentName: "AWS-RunShellScript",
        InstanceIds: ["i-instagram-instance", "i-tiktok-instance"],
        Parameters: {
            commands: [
                "cd /home/ec2-user/social-scraper/instagram-scraper",
                "pm2 restart instagram-scraper",
                "cd /home/ec2-user/social-scraper/tiktok-scraper", 
                "pm2 restart tiktok-scraper"
            ]
        }
    };
    
    try {
        const result = await ssm.sendCommand(command).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Scraper restart initiated',
                commandId: result.Command.CommandId
            })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error restarting scrapers',
                error: error.message
            })
        };
    }
};
```

## 비용 최적화

### 1. 인스턴스 스케줄링

#### Auto Scaling Group 설정
```bash
# 시작 템플릿 생성
aws ec2 create-launch-template \
  --launch-template-name scraper-template \
  --launch-template-data file://launch-template.json

# Auto Scaling Group 생성
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name scraper-asg \
  --launch-template LaunchTemplateName=scraper-template,Version=1 \
  --min-size 0 \
  --max-size 2 \
  --desired-capacity 1 \
  --vpc-zone-identifier subnet-xxxxx,subnet-yyyyy
```

### 2. Spot 인스턴스 활용

#### Spot Fleet 요청
```json
{
  "SpotFleetRequestConfig": {
    "IamFleetRole": "arn:aws:iam::account:role/aws-ec2-spot-fleet-role",
    "AllocationStrategy": "lowestPrice",
    "TargetCapacity": 2,
    "SpotPrice": "0.05",
    "LaunchSpecifications": [
      {
        "ImageId": "ami-0c6e5afdd23291f73",
        "InstanceType": "t3.small",
        "KeyName": "your-key-pair",
        "SecurityGroups": [{"GroupId": "sg-xxxxx"}],
        "SubnetId": "subnet-xxxxx"
      }
    ]
  }
}
```

### 3. 리소스 태깅

```bash
# 모든 리소스에 태그 추가
aws ec2 create-tags --resources i-xxxxx --tags Key=Project,Value=SocialScraper Key=Environment,Value=Production Key=Owner,Value=YourName
```

## 백업 및 복구

### 1. RDS 자동 백업 설정

```bash
# 백업 보존 기간 설정 (7일)
aws rds modify-db-instance \
  --db-instance-identifier scraper-db \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00"
```

### 2. EBS 스냅샷 자동화

```bash
# Data Lifecycle Manager 정책 생성
aws dlm put-lifecycle-configuration \
  --execution-role-arn arn:aws:iam::account:role/AWSDataLifecycleManagerDefaultRole \
  --description "Daily snapshots for scraper instances" \
  --state ENABLED \
  --policy-details file://dlm-policy.json
```

## 트러블슈팅

### 1. 일반적인 문제들

#### EC2 인스턴스 접속 불가
```bash
# 보안 그룹 확인
aws ec2 describe-security-groups --group-ids sg-xxxxx

# 키 페어 확인
ssh -i your-key.pem ec2-user@your-instance-ip
```

#### RDS 연결 실패
```bash
# 보안 그룹 규칙 확인
aws ec2 describe-security-groups --group-ids sg-rds-xxxxx

# RDS 엔드포인트 확인
aws rds describe-db-instances --db-instance-identifier scraper-db
```

### 2. 로그 확인 방법

```bash
# PM2 로그 확인
pm2 logs

# CloudWatch 로그 확인
aws logs get-log-events --log-group-name /aws/ec2/instagram-scraper --log-stream-name your-stream
```

## 마무리

이 가이드를 통해 Instagram과 TikTok 스크래퍼를 AWS에 성공적으로 배포할 수 있습니다. 

### 다음 단계
1. 성능 모니터링 및 최적화
2. 스크래핑 로직 개선
3. 데이터 분석 파이프라인 구축
4. API 서비스 개발

### 지원 및 문의
- AWS 기술 지원: AWS Support 센터
- 애플리케이션 이슈: GitHub Issues
- 긴급 문의: [연락처 정보]

---

**⚠️ 주의사항:**
- 스크래핑 시 해당 플랫폼의 이용약관을 준수하세요
- 적절한 딜레이를 설정하여 서버 부하를 방지하세요
- 개인정보 처리 시 관련 법규를 준수하세요 