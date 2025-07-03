	const DatabaseService = require('./database_service');
	const config = require('../config');

	/**
	 * TikTok 스크래핑 성능 추적 클래스
	 */
	class PerformanceTracker {
	constructor() {
		this.dbService = new DatabaseService(config.database);
		this.activeTasks = new Map(); // 진행 중인 작업들 추적
		this.currentSessionId = null;
		this.config = {
		maxFollowersPerInfluencer: 1000,
		maxCommentsPerPost: 500, 
		maxPostsPerInfluencer: 50,
		enablePerformanceLogging: true,
		scrapingDelayMs: 3000,
		sessionTimeoutMinutes: 180
		};
	}

	/**
	 * 초기화 및 설정 로드
	 */
	async initialize() {
		try {
		await this.dbService.connect();
		await this.loadConfigFromDB();
		console.log('✅ PerformanceTracker 초기화 완료');
		return true;
		} catch (error) {
		console.error('❌ PerformanceTracker 초기화 오류:', error.message);
		return false;
		}
	}

	/**
	 * 데이터베이스에서 설정 로드
	 */
	async loadConfigFromDB() {
		try {
		const query = 'SELECT config_key, config_value, config_type FROM tiktok_scraping_config WHERE is_active = true';
		const result = await this.dbService.query(query);
		
		for (const row of result.rows) {
			const { config_key, config_value, config_type } = row;
			
			let value = config_value;
			if (config_type === 'integer') {
			value = parseInt(config_value);
			} else if (config_type === 'boolean') {
			value = config_value.toLowerCase() === 'true';
			}
			
			// camelCase로 변환
			const camelKey = config_key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
			this.config[camelKey] = value;
		}
		
		console.log('📋 설정 로드 완료:', this.config);
		} catch (error) {
		console.error('설정 로드 오류:', error.message);
		// 기본값 사용
		}
	}

	/**
	 * 스크래핑 세션 시작
	 */
	async startSession(sessionName = null) {
		try {
		if (!sessionName) {
			sessionName = `TikTok_Scraping_${new Date().toISOString().slice(0, 16).replace(/[:-]/g, '')}`;
		}

		const query = `
			INSERT INTO tiktok_scraping_sessions 
			(session_name, session_start_time, config_snapshot, status) 
			VALUES ($1, CURRENT_TIMESTAMP, $2, 'active') 
			RETURNING id
		`;
		
		const result = await this.dbService.query(query, [
			sessionName, 
			JSON.stringify(this.config)
		]);
		
		this.currentSessionId = result.rows[0].id;
		console.log(`🚀 스크래핑 세션 시작: ${sessionName} (ID: ${this.currentSessionId})`);
		return this.currentSessionId;
		
		} catch (error) {
		console.error('세션 시작 오류:', error.message);
		return null;
		}
	}

	/**
	 * 스크래핑 작업 시작 (개별 작업)
	 */
	async startTask(influencerId, scrapingType, targetItems = 0) {
		if (!this.config.enablePerformanceLogging) return null;
		
		const taskId = `${influencerId}_${scrapingType}_${Date.now()}`;
		const startTime = new Date();
		
		this.activeTasks.set(taskId, {
		influencerId,
		scrapingType,
		startTime,
		targetItems
		});
		
		console.log(`⏱️ ${scrapingType} 작업 시작 (인플루언서 ID: ${influencerId})`);
		return taskId;
	}

	/**
	 * 스크래핑 작업 완료
	 */
	async endTask(taskId, itemsCollected = 0, status = 'completed', errorMessage = null) {
		if (!this.config.enablePerformanceLogging || !taskId) return;
		
		try {
		const task = this.activeTasks.get(taskId);
		if (!task) {
			console.warn(`작업 ID ${taskId}를 찾을 수 없습니다.`);
			return;
		}
		
		const endTime = new Date();
		const durationMs = endTime - task.startTime;
		const durationMinutes = Math.round(durationMs / 60000 * 100) / 100;
		
		console.log(`✅ ${task.scrapingType} 작업 완료 (${durationMinutes}분, ${itemsCollected}개 수집)`);
		this.activeTasks.delete(taskId);
		
		} catch (error) {
		console.error('작업 완료 로깅 오류:', error.message);
		}
	}

	/**
	 * 스크래핑 세션 완료
	 */
	async endSession(stats = {}) {
		if (!this.currentSessionId) return;
		
		try {
		const query = `
			UPDATE tiktok_scraping_sessions 
			SET 
			session_end_time = CURRENT_TIMESTAMP,
			total_duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - session_start_time)),
			completed_tasks = $1,
			total_items_collected = $2,
			status = 'completed'
			WHERE id = $3
		`;
		
		await this.dbService.query(query, [
			stats.influencersProcessed || 0,
			stats.totalItemsCollected || 0,
			this.currentSessionId
		]);
		
		console.log(`🏁 스크래핑 세션 완료 (ID: ${this.currentSessionId})`);
		this.currentSessionId = null;
		
		} catch (error) {
		console.error('세션 완료 오류:', error.message);
		}
	}

	/**
	 * 설정값 가져오기
	 */
	getConfig(key = null) {
		if (key) {
		return this.config[key];
		}
		return this.config;
	}

	/**
	 * 팔로워 수집 제한 확인
	 */
	getFollowerLimit() {
		const limit = this.config.maxFollowersPerInfluencer;
		return limit === 0 ? null : limit; // 0이면 무제한
	}

	/**
	 * 댓글 수집 제한 확인
	 */
	getCommentLimit() {
		const limit = this.config.maxCommentsPerPost;
		return limit === 0 ? null : limit; // 0이면 무제한
	}

	/**
	 * 게시물 수집 제한 확인
	 */
	getPostLimit() {
		const limit = this.config.maxPostsPerInfluencer;
		return limit === 0 ? null : limit; // 0이면 무제한
	}

	/**
	 * 요청 딜레이 가져오기
	 */
	getDelay() {
		return this.config.scrapingDelayMs;
	}

	/**
	 * 설정값 업데이트
	 */
	async updateConfig(key, value) {
		try {
		const query = `
			UPDATE tiktok_scraping_config 
			SET config_value = $1, updated_at = CURRENT_TIMESTAMP 
			WHERE config_key = $2
		`;
		
		await this.dbService.query(query, [value.toString(), key]);
		
		// 메모리의 config도 업데이트
		const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
		this.config[camelKey] = value;
		
		console.log(`⚙️ 설정 업데이트: ${key} = ${value}`);
		
		} catch (error) {
		console.error('설정 업데이트 오류:', error.message);
		}
	}

	/**
	 * 성능 통계 조회
	 */
	async getPerformanceStats(influencerId = null, days = 7) {
		try {
		let query = `
			SELECT 
			scraping_type,
			COUNT(*) as task_count,
			AVG(duration_minutes) as avg_duration,
			MAX(duration_minutes) as max_duration,
			MIN(duration_minutes) as min_duration,
			SUM(items_collected) as total_items,
			AVG(collection_rate) as avg_collection_rate
			FROM tiktok_scraping_performance 
			WHERE start_time >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
		`;
		
		const params = [];
		
		if (influencerId) {
			query += ' AND influencer_id = $1';
			params.push(influencerId);
		}
		
		query += ' GROUP BY scraping_type ORDER BY scraping_type';
		
		const result = await this.dbService.query(query, params);
		return result.rows;
		
		} catch (error) {
		console.error('성능 통계 조회 오류:', error.message);
		return [];
		}
	}

	/**
	 * 리소스 정리
	 */
	async cleanup() {
		try {
		// 활성 작업들 정리
		for (const [taskId, task] of this.activeTasks) {
			await this.endTask(taskId, 0, 'interrupted', '시스템 종료로 인한 중단');
		}
		
		// 현재 세션 정리
		if (this.currentSessionId) {
			await this.endSession();
		}
		
		await this.dbService.disconnect();
		console.log('✅ PerformanceTracker 정리 완료');
		
		} catch (error) {
		console.error('PerformanceTracker 정리 오류:', error.message);
		}
	}
	}

	module.exports = PerformanceTracker; 