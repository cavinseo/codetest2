// 이메일 발송 모듈
import nodemailer from 'nodemailer';
import { getSmtpSettings } from './service-settings';
import { escapeHtml, sanitizeHeaderValue } from './html-escape';
import { createLogger } from './logger';

const log = createLogger('lib/email');

export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
}

async function createTransporter() {
    // 설정이 DB 로 옮겨져 조회가 async 다.
    const smtp = await getSmtpSettings();
    if (!smtp.configured) {
        return null;
    }

    return {
        transport: nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.port === 465,
            auth: {
                user: smtp.user,
                pass: smtp.pass,
            },
        }),
        // 발신자 표시에 쓸 계정. 예전에는 serviceSettings.smtp! 로 다시 꺼내 썼다.
        from: smtp.user,
    };
}

/**
 * 공용 메일 발송. SMTP 가 설정되지 않았으면 false 를 돌려준다.
 * 호출부는 이 값을 보고 사용자에게 "메일이 나가지 않았다"고 알려야 한다.
 * 조용히 성공으로 처리하면 관리자가 코드를 전달할 기회를 놓친다.
 */
export async function sendMail(options: EmailOptions): Promise<boolean> {
    const mailer = await createTransporter();
    if (!mailer) {
        log.warn('SMTP 미설정으로 메일을 보내지 못했습니다.');
        return false;
    }

    try {
        await mailer.transport.sendMail({
            from: mailer.from,
            to: options.to,
            subject: sanitizeHeaderValue(options.subject),
            html: options.html,
        });
        return true;
    } catch (error: unknown) {
        log.error('메일 발송 실패', error);
        return false;
    }
}

export async function sendSurveyInvitation(
    email: string,
    surveyLink: string,
    projectName: string
): Promise<boolean> {
    // 프로젝트 이름은 편집 권한자가 자유롭게 정하는 값인데, 이 메일은 프로젝트와
    // 무관한 외부 응답자에게 나간다. 이스케이프하지 않으면 이름에 마크업을 심어
    // 메일 본문에 피싱 링크를 끼워 넣을 수 있다.
    const safeProjectName = escapeHtml(projectName);
    // 메일 제목에 개행이 들어가면 헤더 인젝션이 된다.
    const safeSubjectName = sanitizeHeaderValue(projectName);
    const mailer = await createTransporter();

    if (!mailer) {
        // 수신자 이메일과 설문 링크(비밀 토큰)는 기록하지 않는다. lib/logger.ts 규칙.
        log.warn('SMTP 미설정으로 설문 초대 메일을 보내지 못했습니다.');
        return false;
    }

    const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Kano 설문 조사</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${safeProjectName}</p>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <p style="color: #333; font-size: 16px; line-height: 1.6;">안녕하세요,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6;">
                <strong>${safeProjectName}</strong> 프로젝트의 Kano 품질 분석을 위한 설문 조사에 참여해 주세요.
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
        await mailer.transport.sendMail({
            from: `"KS-QFD" <${mailer.from}>`,
            to: email,
            subject: `[Kano 설문] ${safeSubjectName} - 설문 참여 요청`,
            html,
        });
        // 수신자 이메일은 기록하지 않는다. lib/logger.ts 규칙.
        log.info('설문 초대 메일 발송 성공');
        return true;
    } catch (error) {
        // 수신자 이메일은 기록하지 않는다. lib/logger.ts 규칙.
        log.error('설문 초대 메일 발송 실패', error);
        return false;
    }
}
