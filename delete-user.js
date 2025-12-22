// 사용자 삭제 스크립트
// 사용법: cd backend && node delete-user.js <email>

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function deleteUser(email) {
  let connection;
  
  try {
    console.log(`사용자 삭제 중: ${email}`);
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gsm_market'
    });

    // 이메일 인증 코드 삭제
    await connection.execute('DELETE FROM email_verifications WHERE email = ?', [email]);
    console.log('✅ 이메일 인증 코드 삭제 완료');

    // 사용자 삭제
    const [result] = await connection.execute('DELETE FROM users WHERE email = ?', [email]);
    
    if (result.affectedRows === 0) {
      console.log('⚠️ 해당 이메일의 사용자를 찾을 수 없습니다.');
    } else {
      console.log('✅ 사용자 삭제 완료');
      console.log('이제 다시 회원가입할 수 있습니다.');
    }
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
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
  console.error('사용법: node delete-user.js <email>');
  console.error('예시: node delete-user.js s25047@gsm.hs.kr');
  process.exit(1);
}

deleteUser(email);




