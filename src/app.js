import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chat.js';
import favoriteRoutes from './routes/favorites.js';
import adminRoutes from './routes/admin.js';
import { verifyToken } from './utils/jwt.js';
import pool from './config/database.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
// CORS 설정 - 개발 환경에서는 모든 origin 허용
const corsOptions = {
  origin: (origin, callback) => {
    // 개발 환경에서는 모든 origin 허용
    if (process.env.NODE_ENV === 'development' || !process.env.FRONTEND_URL) {
      callback(null, true);
    } else if (process.env.FRONTEND_URL) {
      // 프로덕션에서는 지정된 origin만 허용
      callback(null, process.env.FRONTEND_URL);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // 개발 환경 또는 프로덕션에서 모든 origin 허용 (같은 서버에서 서빙)
      if (process.env.NODE_ENV === 'development' || !process.env.FRONTEND_URL) {
        callback(null, true);
      } else {
        callback(null, true); // 프로덕션에서도 모든 origin 허용 (같은 서버)
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

// CORS 설정
app.use(cors(corsOptions));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Socket.io 연결 관리
const userSockets = new Map(); // userId -> socketId

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = verifyToken(token);
    socket.userId = decoded.userId;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  userSockets.set(userId, socket.id);
  
  // 사용자별 룸에 입장 (채팅방 목록 업데이트용)
  socket.join(`user_${userId}`);

  console.log(`✅ User ${userId} connected (socket: ${socket.id})`);

  // 채팅방 입장
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    console.log(`User ${userId} joined conversation ${conversationId}`);
  });

  // 채팅방 퇴장
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
    console.log(`User ${userId} left conversation ${conversationId}`);
  });

  // 메시지 전송
  socket.on('send_message', async (data, callback) => {
    try {
      const { conversation_id, content } = data;
      const senderUserId = socket.userId;

      console.log('📨 Received send_message:', {
        conversation_id,
        content: content?.substring(0, 50),
        socketUserId: senderUserId
      });

      if (!content || content.trim().length === 0) {
        if (callback) callback({ error: '메시지 내용이 없습니다.' });
        return;
      }

      if (!senderUserId) {
        console.error('❌ senderUserId is missing!');
        if (callback) callback({ error: '인증 오류' });
        return;
      }

      // 채팅방 소유 확인
      const [conversations] = await pool.execute(
        'SELECT * FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
        [conversation_id, senderUserId, senderUserId]
      );

      if (conversations.length === 0) {
        console.error('❌ Conversation not found or access denied');
        if (callback) callback({ error: '채팅방을 찾을 수 없습니다.' });
        return;
      }

      // 메시지 저장
      const [result] = await pool.execute(
        'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
        [conversation_id, senderUserId, content.trim()]
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
      const hasStudentNumber = studentColumns.length > 0;

      // 저장된 메시지 조회
      const [messages] = await pool.execute(
        `SELECT 
          m.*,
          u.nickname as sender_nickname,
          ${hasStudentNumber ? 'u.student_number as sender_student_number' : 'NULL as sender_student_number'}
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?`,
        [result.insertId]
      );

      const message = messages[0];
      
      console.log('📤 Broadcasting message:', {
        messageId: message.id,
        senderId: message.sender_id,
        conversationId: conversation_id
      });

      // 채팅방의 모든 사용자에게 메시지 전송
      io.to(`conversation_${conversation_id}`).emit('new_message', message);
      
      // 채팅방 목록 업데이트를 위해 관련 사용자들에게 이벤트 전송
      const conversation = conversations[0];
      const buyerId = conversation.buyer_id;
      const sellerId = conversation.seller_id;
      
      io.to(`user_${buyerId}`).emit('conversation_updated', { conversation_id: conversation_id });
      io.to(`user_${sellerId}`).emit('conversation_updated', { conversation_id: conversation_id });

      // 성공 응답
      if (callback) callback({ success: true, message });
    } catch (error) {
      console.error('Send message via socket error:', error);
      if (callback) callback({ error: '메시지 전송에 실패했습니다.' });
    }
  });

  // 메시지 읽음 처리
  socket.on('mark_messages_read', async (data) => {
    try {
      const { conversation_id } = data;
      const userId = socket.userId;

      if (!userId || !conversation_id) return;

      // 채팅방 소유 확인
      const [conversations] = await pool.execute(
        'SELECT * FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
        [conversation_id, userId, userId]
      );

      if (conversations.length === 0) return;

      // 내가 보낸 메시지가 아닌 메시지를 읽음 처리
      await pool.execute(
        'UPDATE messages SET is_read = TRUE WHERE conversation_id = ? AND sender_id != ? AND is_read = FALSE',
        [conversation_id, userId]
      );

      // 상대방에게 읽음 처리 완료 알림
      const conversation = conversations[0];
      const otherUserId = conversation.buyer_id === userId ? conversation.seller_id : conversation.buyer_id;
      
      io.to(`user_${otherUserId}`).emit('messages_read', { conversation_id });
    } catch (error) {
      console.error('Mark messages read error:', error);
    }
  });

  // 타이핑 인디케이터
  socket.on('typing_start', (data) => {
    const { conversation_id } = data;
    socket.to(`conversation_${conversation_id}`).emit('user_typing', {
      conversation_id,
      user_id: socket.userId
    });
  });

  socket.on('typing_stop', (data) => {
    const { conversation_id } = data;
    socket.to(`conversation_${conversation_id}`).emit('user_stopped_typing', {
      conversation_id,
      user_id: socket.userId
    });
  });

  // 연결 해제
  socket.on('disconnect', () => {
    userSockets.delete(userId);
    console.log(`❌ User ${userId} disconnected`);
  });
});

export { httpServer, io };
export default app;


