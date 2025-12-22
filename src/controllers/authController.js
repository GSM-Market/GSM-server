import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { generateToken } from '../utils/jwt.js';
import { sendVerificationCode } from '../utils/email.js';

// 이메일 형식 검증 (백엔드) - @gsm.hs.kr 도메인만 허용
const validateEmail = (email) => {
  // @gsm.hs.kr 도메인만 허용
  const gsmEmailRegex = /^s\d{5}@gsm\.hs\.kr$/i;
  return gsmEmailRegex.test(email);
};

// 인증 코드 생성
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// 학번 자동 계산 함수
// 이메일 형식: s25047@gsm.hs.kr -> s25047
// 25 = 1학년, 24 = 2학년, 23 = 3학년
// 4반까지, 한 반당 18명
// 예: s25047 -> 1학년 3반 11번 (47번 = 3반(37-54), 47-36=11)
const calculateStudentInfo = (email) => {
  try {
    // 이메일에서 s로 시작하는 학번 추출
    const match = email.match(/s(\d+)/i);
    if (!match) {
      return null; // 학번 형식이 아니면 null 반환
    }
    
    const studentNum = match[1]; // 숫자 부분만 추출 (예: "25047")
    const year = parseInt(studentNum.substring(0, 2)); // 앞 2자리 (예: 25)
    const number = parseInt(studentNum.substring(2)); // 나머지 (예: 47)
    
    // 학년 계산
    let grade = null;
    if (year === 23) grade = 3;
    else if (year === 24) grade = 2;
    else if (year === 25) grade = 1;
    else return null; // 지원하지 않는 학년
    
    // 반 계산 (1반: 1-18, 2반: 19-36, 3반: 37-54, 4반: 55-72)
    let classNumber = null;
    let studentOrder = null;
    
    if (number >= 1 && number <= 18) {
      classNumber = 1;
      studentOrder = number;
    } else if (number >= 19 && number <= 36) {
      classNumber = 2;
      studentOrder = number - 18;
    } else if (number >= 37 && number <= 54) {
      classNumber = 3;
      studentOrder = number - 36;
    } else if (number >= 55 && number <= 72) {
      classNumber = 4;
      studentOrder = number - 54;
    } else {
      return null; // 범위를 벗어남
    }
    
    return {
      student_number: `s${studentNum}`,
      grade,
      class_number: classNumber,
      student_order: studentOrder
    };
  } catch (error) {
    console.error('학번 계산 오류:', error);
    return null;
  }
};

// 회원가입
export const register = async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    // 이메일 형식 검증
    if (!validateEmail(email)) {
      return res.status(400).json({ error: '이메일 양식이 맞지 않습니다.' });
    }

    // 입력값 검증
    if (!email || !password || !nickname) {
      return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
    }

    // 이메일 중복 확인 (실제로 존재하는 사용자만 확인)
    const [existingUsers] = await pool.execute(
      'SELECT id, email, nickname, is_verified FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      console.log(`⚠️ 이메일 중복 확인: ${email} (userId: ${existingUser.id}, verified: ${existingUser.is_verified})`);
      
      // 사용자가 존재하지만 인증되지 않은 경우도 중복으로 처리
      return res.status(400).json({ error: '이미 가입된 이메일입니다.' });
    }
    
    console.log(`✅ 이메일 사용 가능: ${email}`);

    // 비밀번호 해싱 (어드민이 아닌 경우만)
    // 어드민 계정은 평문 저장 (개발 환경)
    const hashedPassword = email === 'admin@gsm.hs.kr' ? password : await bcrypt.hash(password, 10);

    // 학번 정보 자동 계산
    const studentInfo = calculateStudentInfo(email);
    console.log('📚 학번 정보 계산:', studentInfo);

    // 트랜잭션 시작
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 사용자 생성 (인증 전) - 학번 정보 포함
      // 필요한 컬럼이 있는지 확인
      const [allColumns] = await connection.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'users'`
      );
      const columnNames = allColumns.map(col => col.COLUMN_NAME);
      const hasAdminColumn = columnNames.includes('is_admin');
      const hasStudentColumns = columnNames.includes('student_number') && 
                                columnNames.includes('grade') && 
                                columnNames.includes('class_number') && 
                                columnNames.includes('student_order');
      
      let result;
      if (hasAdminColumn && hasStudentColumns) {
        // 모든 컬럼이 있는 경우
        [result] = await connection.execute(
          `INSERT INTO users (email, password, nickname, is_verified, is_admin, student_number, grade, class_number, student_order) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [email, hashedPassword, nickname, false, false, studentInfo?.student_number || null, studentInfo?.grade || null, studentInfo?.class_number || null, studentInfo?.student_order || null]
        );
      } else if (hasAdminColumn) {
        // is_admin만 있는 경우
        [result] = await connection.execute(
          `INSERT INTO users (email, password, nickname, is_verified, is_admin) 
           VALUES (?, ?, ?, ?, ?)`,
          [email, hashedPassword, nickname, false, false]
        );
      } else if (hasStudentColumns) {
        // 학번 컬럼만 있는 경우
        [result] = await connection.execute(
          `INSERT INTO users (email, password, nickname, is_verified, student_number, grade, class_number, student_order) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [email, hashedPassword, nickname, false, studentInfo?.student_number || null, studentInfo?.grade || null, studentInfo?.class_number || null, studentInfo?.student_order || null]
        );
      } else {
        // 기본 컬럼만 있는 경우
        [result] = await connection.execute(
          `INSERT INTO users (email, password, nickname, is_verified) 
           VALUES (?, ?, ?, ?)`,
          [email, hashedPassword, nickname, false]
        );
      }

      const userId = result.insertId;
      console.log(`✅ 사용자 생성 성공: ${email} (userId: ${userId})`);

      // 인증 코드 생성 및 저장
      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후

      await connection.execute(
        'INSERT INTO email_verifications (email, code, expires_at) VALUES (?, ?, ?)',
        [email, code, expiresAt]
      );

      console.log(`✅ 인증 코드 저장 성공: ${email}`);

      // 이메일 발송
      const emailSent = await sendVerificationCode(email, code);
      
      if (!emailSent) {
        console.error('⚠️ 이메일 발송 실패 - 하지만 사용자는 생성됨');
        // 이메일 발송 실패해도 사용자는 생성되었으므로 커밋
        await connection.commit();
        connection.release();
        
        // 경고 메시지와 함께 성공 응답 (사용자는 생성되었지만 이메일 발송 실패)
        return res.status(201).json({
          message: '회원가입이 완료되었습니다. 이메일 발송에 실패했지만 계정은 생성되었습니다.',
          warning: '이메일 인증 코드를 받지 못했습니다. 인증 코드 재발송을 시도해주세요.',
          userId: userId,
          emailSent: false
        });
      }

      // 모든 작업 성공 - 커밋
      await connection.commit();
      connection.release();

      console.log(`✅ 회원가입 완료: ${email} (userId: ${userId})`);
      res.status(201).json({
        message: '회원가입이 완료되었습니다. 이메일 인증을 완료해주세요.',
        userId: userId
      });
    } catch (dbError) {
      // 데이터베이스 오류 시 롤백
      await connection.rollback();
      connection.release();
      throw dbError; // 상위 catch 블록에서 처리
    }
  } catch (error) {
    console.error('Register error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState
    });
    res.status(500).json({ 
      error: '서버 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 이메일 인증
export const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: '이메일과 인증 코드를 입력해주세요.' });
    }

    // 인증 코드 확인
    const [verifications] = await pool.execute(
      'SELECT * FROM email_verifications WHERE email = ? AND code = ? ORDER BY expires_at DESC LIMIT 1',
      [email, code]
    );

    if (verifications.length === 0) {
      return res.status(400).json({ error: '인증 코드가 올바르지 않습니다.' });
    }

    const verification = verifications[0];

    // 만료 확인
    if (new Date() > new Date(verification.expires_at)) {
      return res.status(400).json({ error: '인증 코드가 만료되었습니다.' });
    }

    // 사용자 인증 상태 업데이트
    await pool.execute(
      'UPDATE users SET is_verified = ? WHERE email = ?',
      [true, email]
    );

    // 사용된 인증 코드 삭제
    await pool.execute(
      'DELETE FROM email_verifications WHERE email = ?',
      [email]
    );

    res.json({ message: '이메일 인증이 완료되었습니다.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 로그인
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 로그인 요청 받음:', { email, passwordLength: password?.length });

    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    // 사용자 조회 (is_admin 포함, 컬럼이 없을 수 있으므로 안전하게 처리)
    let users;
    try {
      [users] = await pool.execute(
        'SELECT id, email, password, nickname, is_verified, COALESCE(is_admin, false) as is_admin FROM users WHERE email = ?',
        [email]
      );
    } catch (error) {
      // is_admin 컬럼이 없으면 기본 쿼리 사용
      if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('is_admin')) {
        [users] = await pool.execute(
          'SELECT id, email, password, nickname, is_verified, false as is_admin FROM users WHERE email = ?',
          [email]
        );
      } else {
        throw error;
      }
    }

    console.log('🔍 사용자 조회 결과:', {
      email,
      found: users.length > 0,
      userCount: users.length
    });

    if (users.length === 0) {
      console.log('❌ 사용자를 찾을 수 없음:', email);
      // 보안을 위해 회원정보 존재 여부를 구분하지 않고 통일된 메시지 반환
      return res.status(401).json({ 
        error: '아이디 또는 비밀번호가 잘못 되었습니다. 아이디와 비밀번호를 정확히 입력해 주세요.'
      });
    }

    const user = users[0];
    console.log('✅ 사용자 찾음:', {
      id: user.id,
      email: user.email,
      is_admin: user.is_admin,
      is_verified: user.is_verified,
      passwordType: typeof user.password,
      passwordLength: user.password?.length
    });

    // 어드민 계정 확인 (이메일로도 확인)
    const isAdmin = user.is_admin === true || user.is_admin === 1 || user.email === 'admin@gsm.hs.kr' || user.email.toLowerCase() === 'admin@gsm.hs.kr';
    
    console.log('🔐 로그인 시도:', {
      email: user.email,
      is_admin: user.is_admin,
      isAdmin: isAdmin,
      is_verified: user.is_verified,
      passwordMatch: user.password === password
    });
    
    // 이메일 인증 확인 (어드민 계정은 인증 불필요)
    if (!isAdmin && !user.is_verified) {
      return res.status(401).json({ error: '이메일 인증을 완료해주세요.' });
    }

    // 비밀번호 확인 (어드민은 평문, 일반 사용자는 bcrypt)
    let isPasswordValid = false;
    
    if (isAdmin) {
      // 어드민 계정은 평문 비교
      console.log('🔑 어드민 비밀번호 비교:', {
        storedPassword: user.password,
        inputPassword: password,
        directMatch: user.password === password
      });
      
      if (user.password === password) {
        isPasswordValid = true;
        console.log('✅ 어드민 평문 비밀번호 일치');
      } else {
        // 평문 비교 실패 시 bcrypt도 시도 (혹시 해시된 경우)
        try {
          isPasswordValid = await bcrypt.compare(password, user.password);
          console.log('🔑 어드민 bcrypt 비교 결과:', isPasswordValid);
        } catch (e) {
          console.error('❌ 어드민 bcrypt 비교 오류:', e);
          isPasswordValid = false;
        }
      }
    } else {
      // 일반 사용자는 bcrypt 비교
      isPasswordValid = await bcrypt.compare(password, user.password);
    }
    
    console.log('🔐 최종 비밀번호 확인 결과:', isPasswordValid);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: '아이디 또는 비밀번호가 잘못 되었습니다. 아이디와 비밀번호를 정확히 입력해 주세요.'
      });
    }

    // JWT 토큰 생성
    const token = generateToken(user.id);

    res.json({
      message: '로그인 성공',
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        is_admin: isAdmin || false
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 인증 코드 재발송
export const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({ error: '이메일 양식이 맞지 않습니다.' });
    }

    // 사용자 확인
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '가입되지 않은 이메일입니다.' });
    }

    if (users[0].is_verified) {
      return res.status(400).json({ error: '이미 인증된 이메일입니다.' });
    }

    // 새 인증 코드 생성
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.execute(
      'INSERT INTO email_verifications (email, code, expires_at) VALUES (?, ?, ?)',
      [email, code, expiresAt]
    );

    // 이메일 발송
    const emailSent = await sendVerificationCode(email, code);
    if (!emailSent) {
      // 개발 환경에서는 이메일 발송 실패해도 성공으로 처리 (콘솔에 출력됨)
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        return res.json({ 
          message: '인증 코드가 재발송되었습니다. (개발 모드: 콘솔 확인)',
          warning: '이메일 발송 실패 - 개발 모드에서는 콘솔에 인증 코드가 출력됩니다.'
        });
      }
      return res.status(500).json({ error: '이메일 발송에 실패했습니다.' });
    }

    res.json({ message: '인증 코드가 재발송되었습니다.' });
  } catch (error) {
    console.error('Resend verification code error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};


