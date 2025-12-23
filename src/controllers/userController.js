import pool from '../config/database.js';
import bcrypt from 'bcryptjs';

// 내 정보 조회
export const getMyInfo = async (req, res) => {
  try {
    const userId = req.userId;

    // avatar_url 컬럼 존재 여부 확인
    let query = 'SELECT id, email, nickname, is_verified, created_at';
    try {
      const [columns] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'users' 
         AND COLUMN_NAME = 'avatar_url'`
      );
      if (columns.length > 0) {
        query += ', avatar_url';
      }
    } catch (error) {
      console.warn('avatar_url 컬럼 확인 실패, 기본값 사용:', error.message);
    }

    query += ' FROM users WHERE id = ?';

    const [users] = await pool.execute(query, [userId]);

    if (users.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    res.json(users[0]);
  } catch (error) {
    console.error('Get my info error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 내가 올린 상품 목록 조회
export const getMyProducts = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offsetNum = (pageNum - 1) * limitNum;

    console.log('📋 내 상품 조회 요청:', { userId, page, limit });

    if (!userId) {
      console.error('❌ 사용자 ID가 없습니다');
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const [products] = await pool.execute(
      `SELECT 
        p.*,
        u.nickname as seller_nickname,
        1 as is_mine
      FROM products p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT ${limitNum} OFFSET ${offsetNum}`,
      [userId]
    );

    console.log(`✅ ${products.length}개의 내 상품 조회 완료`);

    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM products WHERE user_id = ?',
      [userId]
    );
    const total = countResult[0].total;

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Get my products error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: '서버 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 닉네임 변경
export const updateNickname = async (req, res) => {
  try {
    const userId = req.userId;
    const { nickname } = req.body;

    if (!nickname || nickname.trim().length < 2) {
      return res.status(400).json({ error: '닉네임은 2자 이상이어야 합니다.' });
    }

    if (nickname.trim().length > 20) {
      return res.status(400).json({ error: '닉네임은 20자 이하여야 합니다.' });
    }

    // 닉네임 업데이트
    await pool.execute(
      'UPDATE users SET nickname = ? WHERE id = ?',
      [nickname.trim(), userId]
    );

    // 업데이트된 사용자 정보 조회
    const [users] = await pool.execute(
      'SELECT id, email, nickname, is_verified, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({ 
      message: '닉네임이 변경되었습니다.',
      user: users[0]
    });
  } catch (error) {
    console.error('Update nickname error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 프로필 사진 업로드
export const uploadAvatar = async (req, res) => {
  try {
    const userId = req.userId;
    
    console.log('📤 uploadAvatar 컨트롤러 호출:', {
      userId,
      hasFile: !!req.file,
      file: req.file ? {
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null
    });

    if (!req.file) {
      console.error('❌ 파일이 없습니다');
      return res.status(400).json({ error: '이미지 파일을 업로드해주세요.' });
    }

    // 파일 타입 검증 (jpg, jpeg, png, webp만 허용)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'jpg, jpeg, png, webp 파일만 업로드 가능합니다.' });
    }

    // 파일 크기 검증 (2~5MB)
    const fileSizeMB = req.file.size / (1024 * 1024);
    if (fileSizeMB < 0.1 || fileSizeMB > 5) {
      return res.status(400).json({ error: '파일 크기는 0.1MB 이상 5MB 이하여야 합니다.' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    // avatar_url 컬럼 존재 여부 확인 후 업데이트
    try {
      const [columns] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'users' 
         AND COLUMN_NAME = 'avatar_url'`
      );
      
      if (columns.length > 0) {
        // 기존 프로필 사진이 있으면 파일 삭제 (선택사항)
        const [users] = await pool.execute(
          'SELECT avatar_url FROM users WHERE id = ?',
          [userId]
        );
        
        if (users.length > 0 && users[0].avatar_url) {
          const fs = await import('fs');
          const path = await import('path');
          const { fileURLToPath } = await import('url');
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = path.dirname(__filename);
          const oldFilePath = path.join(__dirname, '../../', users[0].avatar_url);
          
          try {
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
              console.log(`🗑️ 기존 프로필 사진 삭제: ${oldFilePath}`);
            }
          } catch (deleteError) {
            console.warn('기존 프로필 사진 삭제 실패 (무시):', deleteError.message);
          }
        }
        
        // avatar_url 업데이트
        await pool.execute(
          'UPDATE users SET avatar_url = ? WHERE id = ?',
          [avatarUrl, userId]
        );
      } else {
        // 컬럼이 없으면 생성 (선택사항, 마이그레이션에서 처리하는 것이 좋음)
        console.warn('avatar_url 컬럼이 없습니다. 마이그레이션을 실행해주세요.');
        return res.status(500).json({ error: '프로필 사진 기능이 준비되지 않았습니다.' });
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      return res.status(500).json({ error: '프로필 사진 업로드에 실패했습니다.' });
    }

    // 업데이트된 사용자 정보 조회
    const [users] = await pool.execute(
      'SELECT id, email, nickname, avatar_url FROM users WHERE id = ?',
      [userId]
    );

    res.json({
      message: '프로필 사진이 업로드되었습니다.',
      avatar_url: avatarUrl,
      user: users[0]
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 회원 탈퇴
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.userId;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: '비밀번호를 입력해주세요.' });
    }

    // 사용자 조회
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(password, users[0].password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }

    const userEmail = users[0].email;

    console.log(`🗑️ 회원 탈퇴 시작: userId=${userId}, email=${userEmail}`);

    // 트랜잭션 시작하여 모든 관련 데이터 삭제
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. 이메일 인증 코드 삭제 (먼저 삭제)
      const [verifResult] = await connection.execute(
        'DELETE FROM email_verifications WHERE email = ?',
        [userEmail]
      );
      console.log(`  ✅ 이메일 인증 코드 ${verifResult.affectedRows}개 삭제`);

      // 2. 좋아요 삭제 (CASCADE로 자동 삭제되지만 명시적으로 먼저 삭제)
      const [favResult] = await connection.execute(
        'DELETE FROM favorites WHERE user_id = ?',
        [userId]
      );
      console.log(`  ✅ 좋아요 ${favResult.affectedRows}개 삭제`);

      // 3. 채팅 메시지 삭제 (conversations 삭제 전에 명시적으로 삭제)
      const [msgResult] = await connection.execute(
        `DELETE m FROM messages m
         INNER JOIN conversations c ON m.conversation_id = c.id
         WHERE c.buyer_id = ? OR c.seller_id = ?`,
        [userId, userId]
      );
      console.log(`  ✅ 채팅 메시지 ${msgResult.affectedRows}개 삭제`);

      // 4. 채팅방 삭제 (conversations가 삭제되면 messages도 CASCADE로 삭제됨)
      const [convResult] = await connection.execute(
        'DELETE FROM conversations WHERE buyer_id = ? OR seller_id = ?',
        [userId, userId]
      );
      console.log(`  ✅ 채팅방 ${convResult.affectedRows}개 삭제`);

      // 5. 상품 삭제 (CASCADE로 자동 삭제되지만 명시적으로 먼저 삭제)
      const [prodResult] = await connection.execute(
        'DELETE FROM products WHERE user_id = ?',
        [userId]
      );
      console.log(`  ✅ 상품 ${prodResult.affectedRows}개 삭제`);

      // 6. 사용자 삭제 (마지막에 삭제)
      const [deleteResult] = await connection.execute(
        'DELETE FROM users WHERE id = ?',
        [userId]
      );

      if (deleteResult.affectedRows === 0) {
        throw new Error('사용자 삭제에 실패했습니다. affectedRows가 0입니다.');
      }

      console.log(`  ✅ 사용자 삭제 완료 (affectedRows: ${deleteResult.affectedRows})`);

      // 삭제 확인 1: ID로 확인
      const [verifyUsersById] = await connection.execute(
        'SELECT id, email FROM users WHERE id = ?',
        [userId]
      );

      if (verifyUsersById.length > 0) {
        throw new Error(`사용자 삭제 확인 실패: ID ${userId}로 사용자가 여전히 존재합니다.`);
      }

      // 삭제 확인 2: 이메일로 확인
      const [verifyUsersByEmail] = await connection.execute(
        'SELECT id, email FROM users WHERE email = ?',
        [userEmail]
      );

      if (verifyUsersByEmail.length > 0) {
        throw new Error(`사용자 삭제 확인 실패: 이메일 ${userEmail}로 사용자가 여전히 존재합니다.`);
      }

      // 삭제 확인 3: 이메일 인증 코드 확인
      const [verifyVerif] = await connection.execute(
        'SELECT id FROM email_verifications WHERE email = ?',
        [userEmail]
      );

      if (verifyVerif.length > 0) {
        console.log(`  ⚠️ 경고: 이메일 인증 코드가 ${verifyVerif.length}개 남아있습니다. 강제 삭제합니다.`);
        await connection.execute(
          'DELETE FROM email_verifications WHERE email = ?',
          [userEmail]
        );
      }

      console.log(`  ✅ 삭제 확인 완료: 사용자와 관련 데이터가 모두 데이터베이스에서 제거되었습니다.`);

      // 트랜잭션 커밋
      await connection.commit();
      
      console.log(`✅ 회원 탈퇴 완료: userId=${userId}, email=${userEmail}`);
      console.log(`   - 이제 ${userEmail}로 재가입할 수 있습니다.`);
      
      res.json({ 
        message: '회원 탈퇴가 완료되었습니다.',
        email: userEmail // 재가입 가능 여부 확인용
      });
    } catch (error) {
      // 트랜잭션 롤백
      await connection.rollback();
      console.error('❌ 회원 탈퇴 오류:', error);
      console.error('  트랜잭션이 롤백되었습니다.');
      console.error('  사용자 데이터는 삭제되지 않았습니다.');
      
      res.status(500).json({ 
        error: '회원 탈퇴 중 오류가 발생했습니다.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};


