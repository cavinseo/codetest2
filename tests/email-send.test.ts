// 공용 메일 발송(sendMail)이 오류를 로그로 남길 때 수신자 주소를 흘리지 않는지 본다.
//
// 리뷰에서 실제 SMTP 서버로 RCPT TO 를 거부시켜 확인한 문제: nodemailer 오류의
// message 에는 수신자 주소가 그대로 들어 있고, logger.error 는 error.message 를
// meta 에 그대로 넣는다. 원본 오류를 로거에 넘기지 않는지 여기서 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest';

const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
vi.mock('nodemailer', () => ({
    default: { createTransport: createTransportMock },
    createTransport: createTransportMock,
}));

const getSmtpSettings = vi.fn();
vi.mock('../lib/service-settings', () => ({
    getSmtpSettings: () => getSmtpSettings(),
}));

const logInfo = vi.fn();
const logWarn = vi.fn();
const logError = vi.fn();
vi.mock('../lib/logger', () => ({
    createLogger: () => ({ info: logInfo, warn: logWarn, error: logError }),
}));

const { sendMail, sendSurveyInvitation } = await import('../lib/email');

const CONFIGURED_SMTP = {
    host: 'smtp.example.com',
    port: 587,
    user: 'sender@example.com',
    pass: 'app-password',
    configured: true,
};

// logger 로 넘어간 모든 호출을, 인자 하나하나까지 포함해 문자열로 합친다.
// Error 객체는 message 가 열거 불가능한 속성이라 JSON.stringify 로 통째로 찍으면
// 조용히 사라진다 — 원본 오류를 그대로 넘기는 버그를 놓치지 않으려면 따로 뽑아야 한다.
function describeArgument(value: unknown): string {
    if (value instanceof Error) {
        return `${value.message} ${JSON.stringify({ ...value })}`;
    }
    return JSON.stringify(value) ?? '';
}

function allLoggedText(): string {
    const calls = [...logInfo.mock.calls, ...logWarn.mock.calls, ...logError.mock.calls];
    return calls.map((args) => args.map(describeArgument).join(' ')).join(' ');
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('sendMail', () => {
    it('SMTP 가 설정되지 않았으면 false 를 돌려주고 수신자 주소를 남기지 않는다', async () => {
        getSmtpSettings.mockResolvedValue({ configured: false });

        const result = await sendMail({
            to: 'real.person@example.com',
            subject: '제목',
            html: '<p>본문</p>',
        });

        expect(result).toBe(false);
        expect(createTransportMock).not.toHaveBeenCalled();
        expect(allLoggedText()).not.toContain('real.person@example.com');
    });

    it('발송이 거부되면 false 를 돌려주고(예외를 던지지 않고) 수신자 주소를 로그에 남기지 않는다', async () => {
        getSmtpSettings.mockResolvedValue(CONFIGURED_SMTP);
        // 실제 SMTP 거부 메시지와 같은 모양: 진짜처럼 보이는 가짜 주소를 넣어 둔다.
        const leakedAddress = 'real.person@example.com';
        const rejection = Object.assign(
            new Error(
                `Can't send mail - all recipients were rejected: 550 5.1.1 <${leakedAddress}>: Recipient address rejected: User unknown`
            ),
            { code: 'EENVELOPE', responseCode: 550 }
        );
        sendMailMock.mockRejectedValue(rejection);

        const result = await sendMail({
            to: leakedAddress,
            subject: '제목',
            html: '<p>본문</p>',
        });

        expect(result).toBe(false);
        expect(allLoggedText()).not.toContain(leakedAddress);
        // 완전히 버리지는 않는다 — 진단 가능한 코드는 남아야 한다.
        expect(allLoggedText()).toContain('EENVELOPE');
    });

    it('발송에 성공하면 true 를 돌려주고, 제목은 sanitizeHeaderValue 를 거친다', async () => {
        getSmtpSettings.mockResolvedValue(CONFIGURED_SMTP);
        sendMailMock.mockResolvedValue({ messageId: 'msg-1' });

        const result = await sendMail({
            to: 'real.person@example.com',
            subject: '제목 줄바꿈\n주입 시도',
            html: '<p>본문</p>',
        });

        expect(result).toBe(true);
        expect(sendMailMock).toHaveBeenCalledTimes(1);
        const sentMail = sendMailMock.mock.calls[0][0] as { subject: string };
        expect(sentMail.subject).not.toContain('\n');
        expect(sentMail.subject).toBe('제목 줄바꿈 주입 시도');
    });
});

describe('sendSurveyInvitation', () => {
    // 설문 링크는 응답자 신원을 대신하는 비밀 토큰이라 수신자 주소와 같은 급으로 다룬다.
    const RECIPIENT = 'respondent@example.com';
    const SURVEY_LINK = 'https://app.example.com/survey/secret-token-123';

    it('프로젝트 이름의 마크업을 본문에서 이스케이프하고 제목의 개행을 없앤다', async () => {
        getSmtpSettings.mockResolvedValue(CONFIGURED_SMTP);
        sendMailMock.mockResolvedValue({ messageId: 'msg-2' });

        // 프로젝트 이름은 편집 권한자가 정하는데 이 메일은 외부 응답자에게 나간다.
        // 그대로 넣으면 이름에 링크를 심어 피싱을 끼워 넣을 수 있다.
        const result = await sendSurveyInvitation(
            RECIPIENT,
            SURVEY_LINK,
            '<a href="https://evil.example.com">당첨</a>\n두 번째 줄'
        );

        expect(result).toBe(true);
        const sentMail = sendMailMock.mock.calls[0][0] as { to: string; subject: string; html: string };

        expect(sentMail.to).toBe(RECIPIENT);
        expect(sentMail.html).not.toContain('<a href="https://evil.example.com">');
        expect(sentMail.html).toContain('&lt;a href=&quot;https://evil.example.com&quot;&gt;');
        // 링크 자체는 본문에 그대로 들어가야 응답자가 설문에 들어올 수 있다.
        expect(sentMail.html).toContain(SURVEY_LINK);

        expect(sentMail.subject).not.toContain('\n');
        expect(sentMail.subject.startsWith('[Kano 설문] ')).toBe(true);
        expect(sentMail.subject.endsWith(' - 설문 참여 요청')).toBe(true);

        expect(allLoggedText()).not.toContain(RECIPIENT);
        expect(allLoggedText()).not.toContain('secret-token-123');
    });

    it('SMTP 가 설정되지 않았으면 false 를 돌려주고 수신자와 설문 링크를 남기지 않는다', async () => {
        getSmtpSettings.mockResolvedValue({ configured: false });

        const result = await sendSurveyInvitation(RECIPIENT, SURVEY_LINK, '프로젝트');

        expect(result).toBe(false);
        expect(sendMailMock).not.toHaveBeenCalled();
        expect(allLoggedText()).not.toContain(RECIPIENT);
        expect(allLoggedText()).not.toContain('secret-token-123');
    });

    it('발송이 거부되면 false 를 돌려주고 코드만 남긴다', async () => {
        getSmtpSettings.mockResolvedValue(CONFIGURED_SMTP);
        // 실제 SMTP 거부 메시지에는 수신자 주소가 들어 있다. 원본 오류를 로거에
        // 그대로 넘기면 그 주소가 meta 로 새어 나간다.
        sendMailMock.mockRejectedValue(Object.assign(
            new Error(`550 5.1.1 <${RECIPIENT}>: Recipient address rejected`),
            { code: 'EENVELOPE' }
        ));

        const result = await sendSurveyInvitation(RECIPIENT, SURVEY_LINK, '프로젝트');

        expect(result).toBe(false);
        expect(allLoggedText()).not.toContain(RECIPIENT);
        expect(allLoggedText()).not.toContain('secret-token-123');
        expect(allLoggedText()).toContain('EENVELOPE');
    });
});
