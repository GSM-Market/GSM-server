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
const calculateStudentInfo = (email) => {
  try {
    const match = email.match(/s(\d+)/i);
    if (!match) {
      return null;
    }
    
    const studentNum = match[1];
    const year = parseInt(studentNum.substring(0, 2));
    const number = parseInt(studentNum.substring(2));
    
    let grade = null;
    if (year === 23) grade = 3;
    else if (year === 24) grade = 2;
    else if (year === 25) grade = 1;
    else return null;
    
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
      return null;
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

// 회원가입 - pending_users 테이블 사용
export const register = async (req, res) => {
  try {
    const { email, password, nickname } = req.body;
    
    console.log('📝 회원가입 요청:', { email, hasPassword: !!password, passwordLength: password?.length, nickname });

    // 입력값 검증
    if (!email || !password || !nickname) {
      console.log('❌ 입력값 누락:', { email: !!email, password: !!password, nickname: !!nickname });
      return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
    }

    if (password.length < 8) {
      console.log('❌ 비밀번호 길이 부족:', password.length);
      return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
    }
    
    if (!/\d/.test(password)) {
      console.log('❌ 비밀번호에 숫자 없음');
      return res.status(400).json({ error: '비밀번호에 숫자를 포함해주세요.' });
    }
    
    if (!/[a-zA-Z]/.test(password)) {
      console.log('❌ 비밀번호에 영문자 없음');
      return res.status(400).json({ error: '비밀번호에 영문자를 포함해주세요.' });
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      console.log('❌ 비밀번호에 특수문자 없음');
      return res.status(400).json({ error: '비밀번호에 특수문자를 포함해주세요.' });
    }

    // 이메일 형식 검증
    if (!validateEmail(email)) {
      console.log('❌ 이메일 형식 오류:', email);
      return res.status(400).json({ error: '이메일 양식이 맞지 않습니다.' });
    }

    // users 테이블에서 인증 완료된 이메일 확인
    const [existingUsers] = await pool.execute(
      'SELECT id, email FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      // users에 있으면 이미 인증 완료된 계정
      console.log(`⚠️ 이미 인증된 사용자 존재: ${email}`);
      return res.status(400).json({ error: '이미 가입된 이메일입니다.' });
    }

    // pending_users 테이블 확인
    const [existingPending] = await pool.execute(
      'SELECT id, email FROM pending_users WHERE email = ?',
      [email]
    );

    // 비밀번호 해싱
    const hashedPassword = email === 'admin@gsm.hs.kr' ? password : await bcrypt.hash(password, 10);

    // 학번 정보 자동 계산
    const studentInfo = calculateStudentInfo(email);
    console.log('📚 학번 정보 계산:', studentInfo);

    // 트랜잭션 시작
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // pending_users에 이미 있으면 삭제 후 재생성 (갱신)
      if (existingPending.length > 0) {
        console.log(`🔄 기존 pending 사용자 발견: ${email} - 갱신`);
        await connection.execute(
          'DELETE FROM pending_users WHERE email = ?',
          [email]
        );
        // 관련 인증 코드도 삭제
        await connection.execute(
          'DELETE FROM email_verifications WHERE email = ?',
          [email]
        );
      }

      // pending_users에 저장 (인증 완료 전)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30분 후 만료
      
      const [result] = await connection.execute(
        `INSERT INTO pending_users (email, password, nickname, student_number, grade, class_number, student_order, expires_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          email, 
          hashedPassword, 
          nickname, 
          studentInfo?.student_number || null, 
          studentInfo?.grade || null, 
          studentInfo?.class_number || null, 
          studentInfo?.student_order || null,
          expiresAt
        ]
      );

      const pendingUserId = result.insertId;
      console.log(`✅ pending_users에 저장 성공: ${email} (pendingUserId: ${pendingUserId})`);

      // 인증 코드 생성 및 저장
      const code = generateVerificationCode();
      const codeExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후

      await connection.execute(
        'INSERT INTO email_verifications (email, code, expires_at) VALUES (?, ?, ?)',
        [email, code, codeExpiresAt]
      );

      console.log(`✅ 인증 코드 저장 성공: ${email}`);

      // 이메일 발송
      const emailSent = await sendVerificationCode(email, code);
      
      if (!emailSent) {
        console.error('⚠️ 이메일 발송 실패 - 하지만 pending_users와 인증 코드는 생성됨');
        await connection.commit();
        connection.release();
        
        return res.status(201).json({
          message: '회원가입이 완료되었습니다. 이메일 발송에 실패했지만 인증 코드는 생성되었습니다.',
          warning: '이메일 발송에 실패했지만 인증 코드는 생성되었습니다. 아래 인증 코드를 입력해주세요.',
          pendingUserId: pendingUserId,
          emailSent: false,
          verificationCode: code
        });
      }

      // 모든 작업 성공 - 커밋
      await connection.commit();
      connection.release();

      console.log(`✅ 회원가입 완료: ${email} (pendingUserId: ${pendingUserId})`);
      res.status(201).json({
        message: '회원가입이 완료되었습니다. 이메일 인증을 완료해주세요.',
        pendingUserId: pendingUserId
      });
    } catch (dbError) {
      await connection.rollback();
      connection.release();
      throw dbError;
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

// 이메일 인증 - pending_users에서 users로 이동
export const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: '이메일과 인증 코드를 입력해주세요.' });
    }

    // pending_users 확인
    const [pendingUsers] = await pool.execute(
      'SELECT * FROM pending_users WHERE email = ?',
      [email]
    );

    if (pendingUsers.length === 0) {
      // users에 이미 있는지 확인 (이미 인증 완료된 경우)
      const [users] = await pool.execute(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );
      
      if (users.length > 0) {
        return res.status(400).json({ error: '이미 인증된 이메일입니다.' });
      }
      
      return res.status(404).json({ error: '가입되지 않은 이메일입니다. 회원가입을 먼저 진행해주세요.' });
    }

    const pendingUser = pendingUsers[0];

    // 만료 확인
    if (new Date() > new Date(pendingUser.expires_at)) {
      // 만료된 pending_user 삭제
      await pool.execute(
        'DELETE FROM pending_users WHERE email = ?',
        [email]
      );
      await pool.execute(
        'DELETE FROM email_verifications WHERE email = ?',
        [email]
      );
      return res.status(400).json({ error: '회원가입 정보가 만료되었습니다. 다시 회원가입해주세요.' });
    }

    // 인증 코드 확인
    const [verifications] = await pool.execute(
      'SELECT * FROM email_verifications WHERE email = ? AND code = ? ORDER BY expires_at DESC LIMIT 1',
      [email, code]
    );

    if (verifications.length === 0) {
      return res.status(400).json({ error: '인증 코드가 올바르지 않습니다. 다시 입력해주세요.' });
    }

    const verification = verifications[0];

    // 인증 코드 만료 확인
    if (new Date() > new Date(verification.expires_at)) {
      return res.status(400).json({ error: '인증 코드가 만료되었습니다. 인증 코드를 재발송해주세요.' });
    }

    // 트랜잭션 시작: pending_users에서 users로 이동
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // users 테이블 컬럼 확인
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
      const hasAvatarColumn = columnNames.includes('avatar_url');

      // users에 INSERT (인증 완료)
      let result;
      if (hasAdminColumn && hasStudentColumns) {
        [result] = await connection.execute(
          `INSERT INTO users (email, password, nickname, is_verified, is_admin, student_number, grade, class_number, student_order${hasAvatarColumn ? ', avatar_url' : ''}) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${hasAvatarColumn ? ', NULL' : ''})`,
          [
            pendingUser.email, 
            pendingUser.password, 
            pendingUser.nickname, 
            true, 
            false, 
            pendingUser.student_number, 
            pendingUser.grade, 
            pendingUser.class_number, 
            pendingUser.student_order
          ]
        );
      } else if (hasAdminColumn) {
        [result] = await connection.execute(
          `INSERT INTO users (email, password, nickname, is_verified, is_admin${hasAvatarColumn ? ', avatar_url' : ''}) 
           VALUES (?, ?, ?, ?, ?${hasAvatarColumn ? ', NULL' : ''})`,
          [pendingUser.email, pendingUser.password, pendingUser.nickname, true, false]
        );
      } else if (hasStudentColumns) {
        [result] = await connection.execute(
          `INSERT INTO users (email, password, nickname, is_verified, student_number, grade, class_number, student_order${hasAvatarColumn ? ', avatar_url' : ''}) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?${hasAvatarColumn ? ', NULL' : ''})`,
          [
            pendingUser.email, 
            pendingUser.password, 
            pendingUser.nickname, 
            true, 
            pendingUser.student_number, 
            pendingUser.grade, 
            pendingUser.class_number, 
            pendingUser.student_order
          ]
        );
      } else {
        [result] = await connection.execute(
          `INSERT INTO users (email, password, nickname, is_verified${hasAvatarColumn ? ', avatar_url' : ''}) 
           VALUES (?, ?, ?, ?${hasAvatarColumn ? ', NULL' : ''})`,
          [pendingUser.email, pendingUser.password, pendingUser.nickname, true]
        );
      }

      const userId = result.insertId;
      console.log(`✅ users에 저장 성공: ${email} (userId: ${userId})`);

      // pending_users 삭제
      await connection.execute(
        'DELETE FROM pending_users WHERE email = ?',
        [email]
      );

      // 인증 코드 삭제
      await connection.execute(
        'DELETE FROM email_verifications WHERE email = ?',
        [email]
      );

      await connection.commit();
      connection.release();

      res.json({ message: '이메일 인증이 완료되었습니다.' });
    } catch (dbError) {
      await connection.rollback();
      connection.release();
      throw dbError;
    }
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

    // users 테이블에서만 조회 (인증 완료된 사용자만)
    let users;
    try {
      [users] = await pool.execute(
        'SELECT id, email, password, nickname, is_verified, COALESCE(is_admin, false) as is_admin, avatar_url FROM users WHERE email = ?',
        [email]
      );
    } catch (error) {
      if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('is_admin')) {
        [users] = await pool.execute(
          'SELECT id, email, password, nickname, is_verified, false as is_admin, COALESCE(avatar_url, NULL) as avatar_url FROM users WHERE email = ?',
          [email]
        );
      } else if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('avatar_url')) {
        [users] = await pool.execute(
          'SELECT id, email, password, nickname, is_verified, COALESCE(is_admin, false) as is_admin, NULL as avatar_url FROM users WHERE email = ?',
          [email]
        );
      } else {
        throw error;
      }
    }

    if (users.length === 0) {
      console.log('❌ 사용자를 찾을 수 없음:', email);
      return res.status(401).json({ 
        error: '아이디 또는 비밀번호가 잘못 되었습니다. 아이디와 비밀번호를 정확히 입력해 주세요.'
      });
    }

    const user = users[0];
    
    // 어드민 계정 확인
    const isAdmin = user.is_admin === true || user.is_admin === 1 || user.email === 'admin@gsm.hs.kr' || user.email.toLowerCase() === 'admin@gsm.hs.kr';
    
    // 이메일 인증 확인 (어드민 계정은 인증 불필요)
    if (!isAdmin && !user.is_verified) {
      return res.status(401).json({ error: '이메일 인증을 완료해주세요.' });
    }

    // 비밀번호 확인
    let isPasswordValid = false;
    
    if (isAdmin) {
      if (user.password === password) {
        isPasswordValid = true;
      } else {
        try {
          isPasswordValid = await bcrypt.compare(password, user.password);
        } catch (e) {
          isPasswordValid = false;
        }
      }
    } else {
      isPasswordValid = await bcrypt.compare(password, user.password);
    }
    
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
        is_admin: isAdmin || false,
        avatar_url: user.avatar_url || null
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

    // users에 이미 인증 완료된 계정이 있는지 확인
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (users.length > 0) {
      return res.status(400).json({ error: '이미 인증된 이메일입니다.' });
    }

    // pending_users 확인
    const [pendingUsers] = await pool.execute(
      'SELECT * FROM pending_users WHERE email = ?',
      [email]
    );

    if (pendingUsers.length === 0) {
      return res.status(404).json({ error: '가입되지 않은 이메일입니다. 회원가입을 먼저 진행해주세요.' });
    }

    const pendingUser = pendingUsers[0];

    // 만료 확인
    if (new Date() > new Date(pendingUser.expires_at)) {
      // 만료된 pending_user 삭제
      await pool.execute(
        'DELETE FROM pending_users WHERE email = ?',
        [email]
      );
      await pool.execute(
        'DELETE FROM email_verifications WHERE email = ?',
        [email]
      );
      return res.status(400).json({ error: '회원가입 정보가 만료되었습니다. 다시 회원가입해주세요.' });
    }

    // 새 인증 코드 생성
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // 기존 인증 코드 삭제
    await pool.execute(
      'DELETE FROM email_verifications WHERE email = ?',
      [email]
    );

    await pool.execute(
      'INSERT INTO email_verifications (email, code, expires_at) VALUES (?, ?, ?)',
      [email, code, expiresAt]
    );

    // 이메일 발송
    const emailSent = await sendVerificationCode(email, code);
    if (!emailSent) {
      console.error('⚠️ 이메일 발송 실패 - 하지만 인증 코드는 생성됨');
      return res.json({
        message: '인증 코드가 재발송되었습니다. 이메일 발송에 실패했지만 인증 코드는 생성되었습니다.',
        warning: '이메일 발송에 실패했지만 인증 코드는 생성되었습니다. 아래 인증 코드를 입력해주세요.',
        emailSent: false,
        verificationCode: code
      });
    }

    res.json({ 
      message: '인증 코드가 재발송되었습니다.',
      emailSent: true
    });
  } catch (error) {
    console.error('Resend verification code error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
