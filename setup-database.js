// 간단한 데이터베이스 설정 스크립트
// 사용법: cd backend && node setup-database.js

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// .env 파일 로드
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupDatabase() {
  let connection;
  
  try {
    console.log('데이터베이스 연결 중...');
    
    // 데이터베이스 생성용 연결 (데이터베이스 없이 연결)
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    console.log('MySQL 연결 성공!');
    
    // 스키마 파일 읽기 (프로젝트 루트의 database 폴더)
    const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    
    console.log('스키마 파일 읽기 완료');
    console.log('데이터베이스 및 테이블 생성 중...');
    
    // 스키마 실행
    await connection.query(schema);
    
    console.log('✅ 데이터베이스 설정 완료!');
    console.log('생성된 테이블: users, email_verifications, products');
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('MySQL 서버가 실행되지 않았습니다.');
      console.error('XAMPP 사용 시: XAMPP Control Panel에서 MySQL을 시작하세요.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('접근 거부: 비밀번호를 확인하세요.');
      console.error('backend/.env 파일의 DB_PASSWORD를 확인하세요.');
    } else {
      console.error('상세 오류:', error);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

setupDatabase();




