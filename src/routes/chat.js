import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getConversations,
  getOrCreateConversation,
  getConversation,
  getMessages,
  sendMessage
} from '../controllers/chatController.js';

const router = express.Router();

// 모든 라우트는 인증 필요
router.use(authenticate);

// 채팅방 목록 조회
router.get('/conversations', getConversations);

// 특정 상품에 대한 채팅방 조회 또는 생성
router.get('/conversations/product/:product_id', getOrCreateConversation);

// 특정 채팅방 정보 조회
router.get('/conversations/:conversation_id', getConversation);

// 특정 채팅방의 메시지 조회
router.get('/conversations/:conversation_id/messages', getMessages);

// 메시지 전송
router.post('/conversations/:conversation_id/messages', sendMessage);

export default router;

