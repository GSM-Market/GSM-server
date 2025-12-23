import pool from '../config/database.js';

/**
 * 만료된 pending_users 자동 정리
 * expires_at이 지난 pending_users를 삭제합니다.
 */
export const cleanupExpiredPendingUsers = async () => {
  try {
    // 만료된 pending_users 삭제
    const [result] = await pool.execute(
      `DELETE FROM pending_users WHERE expires_at < NOW()`
    );
    
    if (result.affectedRows > 0) {
      console.log(`🧹 만료된 pending_users ${result.affectedRows}개 자동 삭제 완료`);
    }
    
    // 관련 인증 코드도 삭제
    await pool.execute(
      'DELETE FROM email_verifications WHERE expires_at < NOW()'
    );
    
    return result.affectedRows;
  } catch (error) {
    console.error('❌ pending_users 정리 오류:', error);
    return 0;
  }
};

/**
 * 5일 이상 지난 신고 자동 삭제
 * 트래픽 문제를 방지하기 위해 오래된 신고를 정리합니다.
 */
export const cleanupOldReports = async () => {
  try {
    // 5일 이상 지난 신고 삭제
    const [result] = await pool.execute(
      `DELETE FROM reports
       WHERE created_at < DATE_SUB(NOW(), INTERVAL 5 DAY)`
    );
    
    if (result.affectedRows > 0) {
      console.log(`🧹 오래된 신고 ${result.affectedRows}개 자동 삭제 완료 (5일 이상)`);
    }
    
    return result.affectedRows;
  } catch (error) {
    console.error('❌ 신고 정리 오류:', error);
    return 0;
  }
};

/**
 * 주기적으로 만료된 pending_users 및 오래된 신고 정리
 */
export const startCleanupScheduler = () => {
  // 즉시 한 번 실행
  cleanupExpiredPendingUsers();
  cleanupOldReports();
  
  // 10분마다 pending_users 정리
  setInterval(() => {
    cleanupExpiredPendingUsers();
  }, 10 * 60 * 1000); // 10분 = 600,000ms
  
  // 1일마다 오래된 신고 정리
  setInterval(() => {
    cleanupOldReports();
  }, 24 * 60 * 60 * 1000); // 1일 = 86,400,000ms
  
  console.log('✅ 만료된 pending_users 자동 정리 스케줄러 시작 (10분마다 실행)');
  console.log('✅ 오래된 신고 자동 정리 스케줄러 시작 (1일마다 실행, 5일 이상 된 신고 삭제)');
};

