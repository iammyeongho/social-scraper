module.exports = {
  apps: [{
    name: 'instagram-scraper',
    script: 'main.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    
    // 크론잡 설정 (매일 오전 9시 실행)
    cron_restart: '0 9 * * *',
    
    // 재시작 정책
    min_uptime: '10s',
    max_restarts: 10,
    
    // 메모리 모니터링
    max_memory_restart: '1G',
    
    // 환경별 설정
    node_args: '--max-old-space-size=1024'
  }]
}; 