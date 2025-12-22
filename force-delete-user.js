import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function forceDeleteUser(email) {
  let connection;
  
  try {
    console.log(`🗑️ 사용자 강제 삭제 시작: ${email}`);
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'gsm_market'
    });

    // 사용자 확인
    const [users] = await connection.execute(
      'SELECT id, email FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      console.log('✅ 해당 이메일의 사용자가 없습니다.');
      return;
    }

    const userId = users[0].id;
    console.log(`📋 사용자 ID: ${userId}`);

    // 트랜잭션 시작
    await connection.beginTransaction();

    try {
      // 1. 이메일 인증 코드 삭제
      const [verifResult] = await connection.execute(
        'DELETE FROM email_verifications WHERE email = ?',
        [email]
      );
      console.log(`✅ 이메일 인증 코드 ${verifResult.affectedRows}개 삭제`);

      // 2. 좋아요 삭제
      const [favResult] = await connection.execute(
        'DELETE FROM favorites WHERE user_id = ?',
        [userId]
      );
      console.log(`✅ 좋아요 ${favResult.affectedRows}개 삭제`);

      // 3. 채팅 메시지 삭제 (conversations 삭제 시 CASCADE로 자동 삭제되지만 명시적으로)
      const [convResult] = await connection.execute(
        'DELETE FROM conversations WHERE buyer_id = ? OR seller_id = ?',
        [userId, userId]
      );
      console.log(`✅ 채팅방 ${convResult.affectedRows}개 삭제`);

      // 4. 사용자 삭제 (CASCADE로 상품도 자동 삭제)
      const [userResult] = await connection.execute(
        'DELETE FROM users WHERE id = ?',
        [userId]
      );

      if (userResult.affectedRows === 0) {
        throw new Error('사용자 삭제에 실패했습니다.');
      }

      console.log(`✅ 사용자 삭제 완료`);

      // 트랜잭션 커밋
      await connection.commit();
      console.log('✅ 모든 데이터 삭제 완료! 이제 회원가입할 수 있습니다.');
      
    } catch (error) {
      // 트랜잭션 롤백
      await connection.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    console.error('상세 오류:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 명령줄 인자에서 이메일 가져오기
const email = process.argv[2];

if (!email) {
  console.error('❌ 사용법: node force-delete-user.js <email>');
  console.error('예: node force-delete-user.js s25046@gsm.hs.kr');
  console.error('');
  console.error('⚠️ 주의: 이 스크립트는 사용자와 관련된 모든 데이터를 강제로 삭제합니다!');
  process.exit(1);
}

forceDeleteUser(email);


