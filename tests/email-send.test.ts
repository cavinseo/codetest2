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

const { sendMail } = await import('../lib/email');

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
