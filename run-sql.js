import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'gsm_market',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

async function runSQLFile(filePath) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 데이터베이스 연결 성공.');

    // SQL 파일 읽기
    const sql = await fs.readFile(filePath, 'utf8');
    console.log(`📄 SQL 파일 읽기 완료: ${filePath}`);

    // 세미콜론으로 구분된 SQL 문장들로 분리
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 ${statements.length}개의 SQL 문장 실행 중...`);

    // 각 SQL 문장 실행
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        // PREPARE 문은 query()를 사용해야 함
        if (statement.includes('PREPARE') || statement.includes('EXECUTE') || statement.includes('DEALLOCATE')) {
          await connection.query(statement);
        } else {
          await connection.execute(statement);
        }
        console.log(`✅ SQL 문장 ${i + 1}/${statements.length} 실행 완료`);
      } catch (err) {
        // IF NOT EXISTS 구문이 MySQL 버전에 따라 다르게 동작할 수 있으므로 일부 에러는 무시
        if (err.message.includes('already exists') || err.message.includes('Duplicate column')) {
          console.log(`⚠️ SQL 문장 ${i + 1} 경고 (이미 존재함, 무시됨): ${err.message}`);
        } else {
          throw err;
        }
      }
    }

    console.log('✅ SQL 파일 실행 완료!');
  } catch (error) {
    console.error('❌ SQL 파일 실행 중 오류 발생:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('데이터베이스 연결 해제.');
    }
  }
}

// 명령줄 인자로 파일 경로 받기
const sqlFile = process.argv[2];

if (!sqlFile) {
  console.error('❌ 사용법: node run-sql.js <sql-file-path>');
  console.error('예시: node run-sql.js ../database/add_view_count.sql');
  process.exit(1);
}

const filePath = path.resolve(__dirname, sqlFile);
runSQLFile(filePath);

