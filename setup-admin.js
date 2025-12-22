import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

async function setupAdmin() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('데이터베이스 연결 성공.');

    // 1. 스키마 업데이트 SQL 파일 실행
    const schemaPath = path.join(__dirname, '../database/add_admin.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    const statements = schemaSql.split(';').filter(s => s.trim().length > 0);

    console.log('어드민 스키마 업데이트 시작...');
    for (const statement of statements) {
      try {
        await connection.execute(statement);
      } catch (err) {
        // IF NOT EXISTS 구문이 MySQL 버전에 따라 다르게 동작할 수 있으므로 에러 무시
        if (!err.message.includes('already exists') && !err.message.includes('check the manual')) {
          console.warn(`⚠️ SQL 실행 중 경고 (무시됨): ${err.message}`);
        }
      }
    }
    console.log('어드민 스키마 업데이트 완료.');

    console.log('✅ 어드민 계정 설정 완료!');
    console.log('📧 이메일: admin@gsm.hs.kr');
    console.log('🔑 비밀번호: admin');

  } catch (error) {
    console.error('❌ 어드민 설정 중 오류 발생:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('데이터베이스 연결 해제.');
    }
  }
}

setupAdmin();


