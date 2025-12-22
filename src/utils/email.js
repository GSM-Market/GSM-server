import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// 포트에 따라 secure 설정 자동 변경
const port = parseInt(process.env.EMAIL_PORT || '587');
const isSecure = port === 465;

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: port,
  secure: isSecure, // 465는 true, 587은 false
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS?.replace(/\s/g, '') // 공백 제거
  },
  tls: {
    rejectUnauthorized: false // 개발 환경에서만 사용
  }
});

export const sendVerificationCode = async (email, code) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: '[GSM Market] 이메일 인증 코드',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3B82F6;">GSM Market 이메일 인증</h2>
        <p>안녕하세요, GSM Market입니다.</p>
        <p>회원가입을 완료하기 위한 인증 코드입니다.</p>
        <div style="background-color: #F3F4F6; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #3B82F6; font-size: 32px; margin: 0;">${code}</h1>
        </div>
        <p>이 코드는 5분간 유효합니다.</p>
        <p style="color: #6B7280; font-size: 12px;">본인이 요청하지 않았다면 이 이메일을 무시하세요.</p>
      </div>
    `
  };

  try {
    // 이메일 설정 검증
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('⚠️ 이메일 설정이 완료되지 않았습니다.');
      // 이메일 설정이 없으면 콘솔에 인증 코드 출력 (개발/테스트용)
      console.log('═══════════════════════════════════════');
      console.log('📧 [이메일 미설정] 인증 코드 (콘솔 출력)');
      console.log('═══════════════════════════════════════');
      console.log(`받는 사람: ${email}`);
      console.log(`인증 코드: ${code}`);
      console.log('═══════════════════════════════════════');
      console.log('💡 이메일 발송을 사용하려면 EMAIL_USER와 EMAIL_PASS를 설정하세요.');
      console.log('💡 docker-compose.override.yml 또는 .env 파일에 설정하세요.');
      return true; // 이메일 설정이 없어도 성공으로 처리 (콘솔 출력)
    }

    // Gmail SMTP 사용 시 Gmail 계정인지 확인
    if (process.env.EMAIL_HOST === 'smtp.gmail.com' && !process.env.EMAIL_USER.includes('@gmail.com')) {
      console.error('❌ 오류: Gmail SMTP를 사용하려면 Gmail 계정이 필요합니다.');
      console.error(`현재 설정: ${process.env.EMAIL_USER}`);
      console.error('해결 방법:');
      console.error('1. Gmail 계정 사용: EMAIL_USER=your_gmail@gmail.com');
      console.error('2. 또는 학교 이메일 SMTP 서버 사용: EMAIL_HOST=mail.gsm.hs.kr 또는 smtp.hs.kr');
      return false;
    }

    await transporter.sendMail(mailOptions);
    console.log(`✅ 인증 코드 이메일 발송 성공: ${email}`);
    return true;
  } catch (error) {
    console.error('❌ 이메일 발송 오류:', error.message || error);
    console.error('상세 오류:', {
      code: error.code,
      command: error.command,
      response: error.response,
      errno: error.errno,
      syscall: error.syscall,
      hostname: error.hostname
    });
    
    // DNS 오류 시 안내
    if (error.code === 'EDNS' || error.code === 'ENOTFOUND') {
      console.error('❌ DNS 오류: SMTP 서버를 찾을 수 없습니다.');
      console.error(`시도한 서버: ${process.env.EMAIL_HOST}`);
      console.error('다른 SMTP 서버를 시도해보세요:');
      console.error('1. EMAIL_HOST=mail.gsm.hs.kr');
      console.error('2. EMAIL_HOST=smtp.hs.kr');
      console.error('3. 또는 학교 IT 담당자에게 SMTP 서버 주소 문의');
    }
    
    console.error('이메일 설정:', {
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      user: process.env.EMAIL_USER,
      hasPassword: !!process.env.EMAIL_PASS
    });
    return false;
  }
};


