// 이메일 발송 모듈
import nodemailer from 'nodemailer';
import { serviceSettings } from './service-settings';

export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
}

function createTransporter() {
    const smtp = serviceSettings.smtp;
    if (!smtp || !smtp.configured) {
        return null;
    }

    return nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: {
            user: smtp.user,
            pass: smtp.pass,
        },
    });
}

export async function sendSurveyInvitation(
    email: string,
    surveyLink: string,
    projectName: string
): Promise<boolean> {
    const transporter = createTransporter();

    if (!transporter) {
        console.log(`📧 [이메일 미설정] ${email}에게 설문 링크: ${surveyLink}`);
        return false;
    }

    const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Kano 설문 조사</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${projectName}</p>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <p style="color: #333; font-size: 16px; line-height: 1.6;">안녕하세요,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6;">
                <strong>${projectName}</strong> 프로젝트의 Kano 품질 분석을 위한 설문 조사에 참여해 주세요.
                각 기능에 대해 긍정/부정 질문에 답변해 주시면 됩니다.
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${surveyLink}" 
                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600; display: inline-block;">
                    📝 설문 참여하기
                </a>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">
                이 링크는 7일간 유효합니다. 본 메일은 자동 발송되었습니다.
            </p>
        </div>
    </div>
    `;

    try {
        await transporter.sendMail({
            from: `"Kano & QFD" <${serviceSettings.smtp!.user}>`,
            to: email,
            subject: `[Kano 설문] ${projectName} - 설문 참여 요청`,
            html,
        });
        console.log(`✅ 이메일 발송 성공: ${email}`);
        return true;
    } catch (error) {
        console.error(`❌ 이메일 발송 실패: ${email}`, error);
        return false;
    }
}
