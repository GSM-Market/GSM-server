import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkUser(email) {
  let connection;
  
  try {
    console.log(`🔍 사용자 확인 중: ${email}`);
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'gsm_market'
    });

    // 사용자 확인
    const [users] = await connection.execute(
      'SELECT id, email, nickname, is_verified, created_at FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      console.log('✅ 해당 이메일의 사용자가 없습니다. 회원가입 가능합니다.');
    } else {
      console.log('❌ 사용자가 존재합니다:');
      console.log(users[0]);
      
      // 이메일 인증 코드 확인
      const [verifications] = await connection.execute(
        'SELECT * FROM email_verifications WHERE email = ?',
        [email]
      );
      
      if (verifications.length > 0) {
        console.log(`⚠️ 이메일 인증 코드 ${verifications.length}개 발견`);
      }
      
      // 좋아요 확인
      const [favorites] = await connection.execute(
        'SELECT COUNT(*) as count FROM favorites WHERE user_id = ?',
        [users[0].id]
      );
      
      if (favorites[0].count > 0) {
        console.log(`⚠️ 좋아요 ${favorites[0].count}개 발견`);
      }
      
      // 채팅방 확인
      const [conversations] = await connection.execute(
        'SELECT COUNT(*) as count FROM conversations WHERE buyer_id = ? OR seller_id = ?',
        [users[0].id, users[0].id]
      );
      
      if (conversations[0].count > 0) {
        console.log(`⚠️ 채팅방 ${conversations[0].count}개 발견`);
      }
      
      // 상품 확인
      const [products] = await connection.execute(
        'SELECT COUNT(*) as count FROM products WHERE user_id = ?',
        [users[0].id]
      );
      
      if (products[0].count > 0) {
        console.log(`⚠️ 상품 ${products[0].count}개 발견`);
      }
    }
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 명령줄 인자에서 이메일 가져오기
const email = process.argv[2];

if (!email) {
  console.error('❌ 사용법: node check-user.js <email>');
  console.error('예: node check-user.js s25046@gsm.hs.kr');
  process.exit(1);
}

checkUser(email);


