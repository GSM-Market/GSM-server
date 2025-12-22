import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupChatSchema() {
  let connection;
  
  try {
    console.log('📦 채팅 스키마 설정 시작...');
    
    // 데이터베이스 연결
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'gsm_market',
      multipleStatements: true
    });

    console.log('✅ 데이터베이스 연결 성공');

    // SQL 파일 읽기
    const sqlFilePath = path.join(__dirname, '..', 'database', 'chat_schema.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('📄 SQL 파일 읽기 완료');

    // SQL 실행
    await connection.query(sql);
    
    console.log('✅ 채팅 스키마 생성 완료!');
    console.log('   - conversations 테이블 생성됨');
    console.log('   - messages 테이블 생성됨');
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   데이터베이스 접근 권한이 없습니다. .env 파일의 DB_PASSWORD를 확인하세요.');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('   데이터베이스가 존재하지 않습니다. 먼저 기본 스키마를 적용하세요.');
    } else {
      console.error('   상세 오류:', error);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 데이터베이스 연결 종료');
    }
  }
}

setupChatSchema();




