import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// 이메일 서비스 결정: Resend > SendGrid > SMTP
const emailService = process.env.EMAIL_SERVICE || 'smtp';
const useResend = emailService === 'resend' && process.env.RESEND_API_KEY;
const useSendGrid = emailService === 'sendgrid' && process.env.SENDGRID_API_KEY;

// 조건부 import (필요할 때만 로드)
let resend = null;
let sgMail = null;

if (useResend) {
  try {
    const { Resend } = await import('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('📧 Resend 이메일 서비스 활성화');
  } catch (error) {
    console.warn('⚠️ Resend 모듈을 로드할 수 없습니다:', error.message);
  }
} else if (useSendGrid) {
  try {
    const sendgridModule = await import('@sendgrid/mail');
    sgMail = sendgridModule.default;
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('📧 SendGrid 이메일 서비스 활성화');
  } catch (error) {
    console.warn('⚠️ SendGrid 모듈을 로드할 수 없습니다:', error.message);
    console.log('📧 SMTP 이메일 서비스로 전환');
  }
} else {
  console.log('📧 SMTP 이메일 서비스 사용');
}

// SMTP transporter (Resend/SendGrid를 사용하지 않을 때)
let transporter = null;
if (!useResend && !useSendGrid) {
  const port = parseInt(process.env.EMAIL_PORT || '587');
  const isSecure = port === 465;

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: port,
    secure: isSecure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS?.replace(/\s/g, '')
    },
    tls: {
      rejectUnauthorized: false
    },
    // Gmail 인증 문제 해결을 위한 추가 설정
    authMethod: 'PLAIN'
  });
}

export const sendVerificationCode = async (email, code) => {
  const htmlContent = `
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
  `;

  if (useResend) {
    // Resend 사용
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'GSM Market <onboarding@resend.dev>',
        to: email,
        subject: '[GSM Market] 이메일 인증 코드',
        html: htmlContent
      });

      if (error) {
        throw error;
      }

      console.log(`✅ 인증 코드 이메일 발송 성공 (Resend): ${email}`);
      return true;
    } catch (error) {
      console.error('❌ Resend 이메일 발송 오류:', error.message || error);
      
      // 이메일 발송 실패 시에도 인증 코드를 콘솔에 출력
      console.log('═══════════════════════════════════════');
      console.log('📧 [이메일 발송 실패] 인증 코드 (콘솔 출력)');
      console.log('═══════════════════════════════════════');
      console.log(`받는 사람: ${email}`);
      console.log(`인증 코드: ${code}`);
      console.log('═══════════════════════════════════════');
      
      return false;
    }
  } else if (useSendGrid) {
    // SendGrid 사용
    try {
      const msg = {
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@gsmmarket.com',
        subject: '[GSM Market] 이메일 인증 코드',
        html: htmlContent
      };

      await sgMail.send(msg);
      console.log(`✅ 인증 코드 이메일 발송 성공 (SendGrid): ${email}`);
      return true;
    } catch (error) {
      console.error('❌ SendGrid 이메일 발송 오류:', error.message || error);
      if (error.response) {
        console.error('SendGrid 응답:', JSON.stringify(error.response.body, null, 2));
      }
      
      // 이메일 발송 실패 시에도 인증 코드를 콘솔에 출력
      console.log('═══════════════════════════════════════');
      console.log('📧 [이메일 발송 실패] 인증 코드 (콘솔 출력)');
      console.log('═══════════════════════════════════════');
      console.log(`받는 사람: ${email}`);
      console.log(`인증 코드: ${code}`);
      console.log('═══════════════════════════════════════');
      
      return false;
    }
  } else {
    // 기존 SMTP 방식 사용
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '[GSM Market] 이메일 인증 코드',
      html: htmlContent
    };

    try {
      // 이메일 설정 검증
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('⚠️ 이메일 설정이 완료되지 않았습니다.');
        console.log('═══════════════════════════════════════');
        console.log('📧 [이메일 미설정] 인증 코드 (콘솔 출력)');
        console.log('═══════════════════════════════════════');
        console.log(`받는 사람: ${email}`);
        console.log(`인증 코드: ${code}`);
        console.log('═══════════════════════════════════════');
        console.log('💡 이메일 발송을 사용하려면:');
        console.log('   - Resend: EMAIL_SERVICE=resend, RESEND_API_KEY 설정');
        console.log('   - SendGrid: EMAIL_SERVICE=sendgrid, SENDGRID_API_KEY 설정');
        console.log('   - SMTP: EMAIL_USER, EMAIL_PASS 설정');
        console.log('═══════════════════════════════════════');
        return true;
      }

      await transporter.sendMail(mailOptions);
      console.log(`✅ 인증 코드 이메일 발송 성공 (SMTP): ${email}`);
      return true;
    } catch (error) {
      console.error('❌ 이메일 발송 오류:', error.message || error);
      
      // 이메일 발송 실패 시에도 인증 코드를 콘솔에 출력
      console.log('═══════════════════════════════════════');
      console.log('📧 [이메일 발송 실패] 인증 코드 (콘솔 출력)');
      console.log('═══════════════════════════════════════');
      console.log(`받는 사람: ${email}`);
      console.log(`인증 코드: ${code}`);
      console.log('═══════════════════════════════════════');
      
      console.error('상세 오류:', {
        code: error.code,
        command: error.command,
        response: error.response,
        errno: error.errno,
        syscall: error.syscall,
        hostname: error.hostname
      });
      
      return false;
    }
  }
};
