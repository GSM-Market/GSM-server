import pool from '../config/database.js';
import { io } from '../app.js';
import { verifyToken } from '../utils/jwt.js';

// 채팅방 목록 조회
export const getConversations = async (req, res) => {
  try {
    const userId = req.userId;

    // student_number 컬럼 존재 여부 확인
    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'users' 
       AND COLUMN_NAME = 'student_number'`
    );
    const hasStudentNumber = columns.length > 0;

    // student_number 컬럼이 있으면 포함, 없으면 NULL
    const studentNumberSelect = hasStudentNumber
      ? `CASE 
          WHEN c.buyer_id = ? THEN seller.student_number
          ELSE buyer.student_number
        END as other_user_student_number,`
      : `NULL as other_user_student_number,`;

    const query = `SELECT 
        c.id,
        c.product_id,
        c.buyer_id,
        c.seller_id,
        c.updated_at,
        p.title as product_title,
        p.price as product_price,
        p.image_url as product_image,
        CASE 
          WHEN c.buyer_id = ? THEN seller.nickname
          ELSE buyer.nickname
        END as other_user_nickname,
        ${studentNumberSelect}
        CASE 
          WHEN c.buyer_id = ? THEN seller.id
          ELSE buyer.id
        END as other_user_id,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND is_read = FALSE) as unread_count
      FROM conversations c
      JOIN products p ON c.product_id = p.id
      JOIN users buyer ON c.buyer_id = buyer.id
      JOIN users seller ON c.seller_id = seller.id
      WHERE c.buyer_id = ? OR c.seller_id = ?
      ORDER BY c.updated_at DESC`;

    const params = hasStudentNumber
      ? [userId, userId, userId, userId, userId, userId]
      : [userId, userId, userId, userId, userId];

    const [conversations] = await pool.execute(query, params);

    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: '채팅방 목록을 불러오는데 실패했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 특정 채팅방 조회 또는 생성
export const getOrCreateConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const { product_id } = req.params;

    // 상품 정보 조회
    const [products] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [product_id]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }

    const product = products[0];

    // 자신의 상품이면 에러
    if (product.user_id === userId) {
      return res.status(400).json({ error: '자신의 상품에는 채팅할 수 없습니다.' });
    }

    // 기존 채팅방 찾기
    const [existing] = await pool.execute(
      'SELECT * FROM conversations WHERE product_id = ? AND buyer_id = ? AND seller_id = ?',
      [product_id, userId, product.user_id]
    );

    if (existing.length > 0) {
      // 기존 채팅방 반환
      const conversation = existing[0];
      const [messages] = await pool.execute(
        `SELECT 
          m.*,
          u.nickname as sender_nickname
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at ASC`,
        [conversation.id]
      );

      // 상대방 정보
      const [seller] = await pool.execute(
        'SELECT id, nickname, email FROM users WHERE id = ?',
        [product.user_id]
      );

      return res.json({
        conversation: {
          ...conversation,
          product,
          other_user: seller[0],
          messages
        }
      });
    }

    // 새 채팅방 생성
    const [result] = await pool.execute(
      'INSERT INTO conversations (product_id, buyer_id, seller_id) VALUES (?, ?, ?)',
      [product_id, userId, product.user_id]
    );

    const conversationId = result.insertId;

    // 상대방 정보
    const [seller] = await pool.execute(
      'SELECT id, nickname, email FROM users WHERE id = ?',
      [product.user_id]
    );

    res.json({
      conversation: {
        id: conversationId,
        product_id,
        buyer_id: userId,
        seller_id: product.user_id,
        product,
        other_user: seller[0],
        messages: []
      }
    });
  } catch (error) {
    console.error('Get or create conversation error:', error);
    res.status(500).json({ error: '채팅방을 불러오는데 실패했습니다.' });
  }
};

// 특정 채팅방 정보 조회
export const getConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversation_id } = req.params;

    // student_number 컬럼 존재 여부 확인
    let hasStudentNumber = false;
    try {
      const [columns] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'users' 
         AND COLUMN_NAME = 'student_number'`
      );
      hasStudentNumber = columns.length > 0;
    } catch (error) {
      console.warn('student_number 컬럼 확인 실패, 기본값 사용:', error.message);
      hasStudentNumber = false;
    }

    // student_number 컬럼이 있으면 포함, 없으면 NULL
    let query, params;
    if (hasStudentNumber) {
      query = `SELECT 
        c.*,
        p.title as product_title,
        p.price as product_price,
        p.image_url as product_image,
        p.status as product_status,
        CASE 
          WHEN c.buyer_id = ? THEN seller.nickname
          ELSE buyer.nickname
        END as other_user_nickname,
        CASE 
          WHEN c.buyer_id = ? THEN seller.student_number
          ELSE buyer.student_number
        END as other_user_student_number,
        CASE 
          WHEN c.buyer_id = ? THEN seller.id
          ELSE buyer.id
        END as other_user_id,
        CASE 
          WHEN c.buyer_id = ? THEN seller.email
          ELSE buyer.email
        END as other_user_email
      FROM conversations c
      JOIN products p ON c.product_id = p.id
      JOIN users buyer ON c.buyer_id = buyer.id
      JOIN users seller ON c.seller_id = seller.id
      WHERE c.id = ? AND (c.buyer_id = ? OR c.seller_id = ?)`;
      params = [userId, userId, userId, userId, conversation_id, userId, userId];
    } else {
      query = `SELECT 
        c.*,
        p.title as product_title,
        p.price as product_price,
        p.image_url as product_image,
        p.status as product_status,
        CASE 
          WHEN c.buyer_id = ? THEN seller.nickname
          ELSE buyer.nickname
        END as other_user_nickname,
        NULL as other_user_student_number,
        CASE 
          WHEN c.buyer_id = ? THEN seller.id
          ELSE buyer.id
        END as other_user_id,
        CASE 
          WHEN c.buyer_id = ? THEN seller.email
          ELSE buyer.email
        END as other_user_email
      FROM conversations c
      JOIN products p ON c.product_id = p.id
      JOIN users buyer ON c.buyer_id = buyer.id
      JOIN users seller ON c.seller_id = seller.id
      WHERE c.id = ? AND (c.buyer_id = ? OR c.seller_id = ?)`;
      params = [userId, userId, userId, conversation_id, userId, userId];
    }

    // 채팅방 소유 확인 및 정보 조회
    const [conversations] = await pool.execute(query, params);

    if (conversations.length === 0) {
      return res.status(403).json({ error: '채팅방에 접근할 수 없습니다.' });
    }

    const conv = conversations[0];
    res.json({
      conversation: {
        id: conv.id,
        product_id: conv.product_id,
        buyer_id: conv.buyer_id,
        seller_id: conv.seller_id,
        product: {
          id: conv.product_id,
          title: conv.product_title,
          price: conv.product_price,
          image_url: conv.product_image,
          status: conv.product_status
        },
        other_user: {
          id: conv.other_user_id,
          nickname: conv.other_user_nickname,
          email: conv.other_user_email,
          student_number: conv.other_user_student_number
        }
      }
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: '채팅방을 불러오는데 실패했습니다.' });
  }
};

// 특정 채팅방의 메시지 조회
export const getMessages = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversation_id } = req.params;

    // 채팅방 소유 확인
    const [conversations] = await pool.execute(
      'SELECT * FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
      [conversation_id, userId, userId]
    );

    if (conversations.length === 0) {
      return res.status(403).json({ error: '채팅방에 접근할 수 없습니다.' });
    }

    // student_number 컬럼 존재 여부 확인
    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'users' 
       AND COLUMN_NAME = 'student_number'`
    );
    const hasStudentNumber = columns.length > 0;

    const [messages] = await pool.execute(
      `SELECT 
        m.*,
        u.nickname as sender_nickname,
        ${hasStudentNumber ? 'u.student_number as sender_student_number' : 'NULL as sender_student_number'}
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC`,
      [conversation_id]
    );

    // 읽음 처리
    await pool.execute(
      'UPDATE messages SET is_read = TRUE WHERE conversation_id = ? AND sender_id != ? AND is_read = FALSE',
      [conversation_id, userId]
    );

    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: '메시지를 불러오는데 실패했습니다.' });
  }
};

// 메시지 전송
export const sendMessage = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversation_id } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: '메시지 내용을 입력해주세요.' });
    }

    // 채팅방 소유 확인
    const [conversations] = await pool.execute(
      'SELECT * FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
      [conversation_id, userId, userId]
    );

    if (conversations.length === 0) {
      return res.status(403).json({ error: '채팅방에 접근할 수 없습니다.' });
    }

    // 메시지 저장
    const [result] = await pool.execute(
      'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
      [conversation_id, userId, content.trim()]
    );

    // 채팅방 업데이트 시간 갱신
    await pool.execute(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [conversation_id]
    );

    // student_number 컬럼 존재 여부 확인
    const [studentColumns] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'users' 
       AND COLUMN_NAME = 'student_number'`
    );
    const hasStudentNumberForMessage = studentColumns.length > 0;

    // 저장된 메시지 조회
    const [messages] = await pool.execute(
      `SELECT 
        m.*,
        u.nickname as sender_nickname,
        ${hasStudentNumberForMessage ? 'u.student_number as sender_student_number' : 'NULL as sender_student_number'}
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?`,
      [result.insertId]
    );

    const message = messages[0];
    
    // Socket.io로 실시간 브로드캐스트
    if (io) {
      // 채팅방의 모든 사용자에게 메시지 전송
      io.to(`conversation_${conversation_id}`).emit('new_message', message);
      
      // 채팅방 목록 업데이트를 위해 관련 사용자들에게 이벤트 전송
      const conversation = conversations[0];
      const buyerId = conversation.buyer_id;
      const sellerId = conversation.seller_id;
      
      // buyer와 seller에게 채팅방 목록 업데이트 이벤트 전송
      io.to(`user_${buyerId}`).emit('conversation_updated', { conversation_id: conversation_id });
      io.to(`user_${sellerId}`).emit('conversation_updated', { conversation_id: conversation_id });
    }

    res.json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: '메시지 전송에 실패했습니다.' });
  }
};

