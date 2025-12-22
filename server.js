import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import express from 'express';
import app, { httpServer } from './src/app.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// 프로덕션 환경에서 프론트엔드 정적 파일 서빙
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(__dirname, '../frontend/dist');
  const fs = await import('fs');
  
  // 프론트엔드 빌드 파일 서빙
  app.use(express.static(frontendDistPath));
  
  // SPA 라우팅 - API와 업로드 파일을 제외한 모든 요청을 index.html로
  app.get('*', (req, res, next) => {
    // API 경로나 업로드 파일 경로는 제외
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    
    // 정적 파일이 존재하면 서빙
    const filePath = path.join(frontendDistPath, req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
    
    // 그 외의 경우 index.html 서빙 (SPA 라우팅)
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
  
  console.log('📦 프론트엔드 정적 파일 서빙 활성화:', frontendDistPath);
}

// 정적 파일 서빙 (업로드된 이미지) - CORS 헤더 포함
app.use('/uploads', (req, res, next) => {
  // CORS 헤더 설정 (이미지 리소스 접근 허용)
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // Origin 헤더가 없으면 모든 origin 허용 (개발 환경)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
}, express.static(path.join(__dirname, 'uploads'), {
  // 캐시 설정 (선택사항)
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
  console.log(`🌐 Server is accessible from network: http://0.0.0.0:${PORT}`);
  console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads')}`);
  console.log(`💬 Socket.io is ready for chat`);
  
  // 프로덕션 모드인 경우
  if (process.env.NODE_ENV === 'production') {
    console.log('\n📦 프로덕션 모드: 프론트엔드와 백엔드가 같은 서버에서 서빙됩니다');
    console.log('🌍 전 세계 접속을 원하시면 ngrok을 사용하세요:');
    console.log('   1. ngrok http 3000');
    console.log('   2. 표시된 HTTPS URL을 복사하여 공유하세요!');
  }
  
  // 로컬 IP 주소 표시
  const networkInterfaces = os.networkInterfaces();
  console.log('\n📡 Network Access URLs:');
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (process.env.NODE_ENV === 'production') {
          console.log(`   http://${iface.address}:${PORT} (프론트엔드 + 백엔드)`);
        } else {
          console.log(`   Backend: http://${iface.address}:${PORT}`);
          console.log(`   Frontend: http://${iface.address}:5173`);
        }
      }
    });
  });
  console.log('\n💡 같은 네트워크의 다른 기기에서 접속하려면 위의 IP 주소를 사용하세요!');
  console.log('🌍 전 세계 접속을 원하시면 deploy-global.bat을 실행하세요!');
});


