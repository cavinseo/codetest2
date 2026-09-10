// 여러 이메일의 초대 발급과 재발송이 순서·부분 실패·중단 조건을 지키는지 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INVITE_BATCH_LIMIT, parseInviteEmails, runInviteBatch } from '../lib/invite-batch';

const fetchMock = vi.fn();
const issue = (email: string) => ({ kind: 'issue' as const, email, programId: 'program_1' });
const send = (email: string, id = 'invite_1') => ({ kind: 'send' as const, email, id });

function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(response({ success: true, emailSent: true, code: 'CODE-1234' }));
});

afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

describe('다중 초대 이메일 입력', () => {
    it('줄바꿈·공백·쉼표·세미콜론을 구분자로 쓰고 주소를 소문자로 정리한다', () => {
        expect(parseInviteEmails('  ONE@Example.com\r\ntwo@example.com,THREE@example.com;four@example.com\tfive@example.com  ')).toEqual({
            emails: ['one@example.com', 'two@example.com', 'three@example.com', 'four@example.com', 'five@example.com'],
            invalid: [], duplicateCount: 0,
        });
    });

    it('대소문자가 다른 같은 이메일은 한 번만 남기고 유효 이메일 중복만 센다', () => {
        expect(parseInviteEmails('A@example.com a@EXAMPLE.com A@example.com invalid invalid')).toEqual({
            emails: ['a@example.com'], invalid: ['invalid', 'invalid'], duplicateCount: 2,
        });
    });

    it('잘못된 주소를 유효한 주소와 분리한다', () => {
        expect(parseInviteEmails('missing-at example@ user@example.com another@.com')).toEqual({
            emails: ['user@example.com'], invalid: ['missing-at', 'example@', 'another@.com'], duplicateCount: 0,
        });
    });

    it('빈 입력과 연속 구분자에서 빈 주소를 만들지 않는다', () => {
        expect(parseInviteEmails(' \n\r\t,;; ')).toEqual({ emails: [], invalid: [], duplicateCount: 0 });
    });
});

describe('다중 초대 요청 처리', () => {
    it('멘티 역할과 선택 프로그램을 기존 단건 발급 API로 보낸다', async () => {
        const result = await runInviteBatch([issue('one@example.com')]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/invites');
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({ email: 'one@example.com', role: 'MENTEE', programId: 'program_1' });
        expect(result).toEqual([expect.objectContaining({ email: 'one@example.com', status: 'sent', message: expect.any(String) })]);
    });

    it('기존 코드 발송에는 초대 ID만 사용하고 수신 이메일을 본문에 넣지 않는다', async () => {
        const result = await runInviteBatch([send('one@example.com', 'invite_2')]);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/invites/invite_2/send');
        expect(options.method).toBe('POST');
        expect(options.body).toBeUndefined();
        expect(result[0]).toMatchObject({ email: 'one@example.com', status: 'sent' });
    });

    it('발급은 성공했지만 메일이 실패하면 코드를 보존한 issued 결과를 돌려준다', async () => {
        fetchMock.mockResolvedValueOnce(response({ success: true, emailSent: false, code: 'PRESERVED-CODE' }));
        expect(await runInviteBatch([issue('one@example.com')])).toEqual([
            expect.objectContaining({ email: 'one@example.com', status: 'issued', code: 'PRESERVED-CODE', message: expect.any(String) }),
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        [409, { success: false, error: '이미 발행된 유효한 초대 코드가 있습니다.' }],
        [500, { error: '서버 오류입니다.' }],
        [200, { success: false, error: '처리할 수 없습니다.' }],
    ])('HTTP %i 발급 실패를 항목별 오류로 알린다', async (status, body) => {
        fetchMock.mockResolvedValueOnce(response(body, status));
        expect((await runInviteBatch([issue('one@example.com')]))[0]).toMatchObject({ email: 'one@example.com', status: 'failed', message: body.error });
    });

    it('SMTP 재발송 실패는 발급 성공으로 표시하지 않는다', async () => {
        fetchMock.mockResolvedValueOnce(response({ success: false, emailSent: false, error: '메일 발송에 실패했습니다.' }, 502));
        expect((await runInviteBatch([send('one@example.com')]))[0]).toMatchObject({ status: 'failed', message: '메일 발송에 실패했습니다.' });
    });

    it('재발송 응답이 성공이어도 emailSent가 false이면 실패로 알린다', async () => {
        fetchMock.mockResolvedValueOnce(response({ success: true, emailSent: false }));
        expect((await runInviteBatch([send('one@example.com')]))[0]).toMatchObject({ status: 'failed', message: expect.any(String) });
    });

    it('네트워크 실패 뒤에도 다음 항목을 처리하고 자동 재시도하지 않는다', async () => {
        fetchMock.mockRejectedValueOnce(new Error('network unavailable'));
        fetchMock.mockResolvedValueOnce(response({ success: true, emailSent: true, code: 'SECOND-CODE' }));
        const onResult = vi.fn();
        const result = await runInviteBatch([issue('one@example.com'), issue('two@example.com')], onResult);
        expect(result.map((item) => item.status)).toEqual(['failed', 'sent']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(onResult).toHaveBeenCalledTimes(2);
        expect(onResult.mock.calls.map((call) => call[0])).toEqual(result);
    });

    it('JSON이 아닌 오류 응답도 항목 실패로 처리하고 다음 항목을 계속한다', async () => {
        fetchMock.mockResolvedValueOnce(new Response('<html>Gateway Error</html>', { status: 502 }));
        fetchMock.mockResolvedValueOnce(response({ success: true, emailSent: true }));
        const result = await runInviteBatch([send('one@example.com'), send('two@example.com', 'invite_2')]);
        expect(result.map((item) => item.status)).toEqual(['failed', 'sent']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('앞선 요청이 완료될 때까지 다음 요청을 시작하지 않는다', async () => {
        let finishFirst!: (value: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishFirst = resolve; }));
        fetchMock.mockResolvedValueOnce(response({ success: true, emailSent: true }));
        const pending = runInviteBatch([issue('one@example.com'), issue('two@example.com')]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        finishFirst(response({ success: true, emailSent: true }));
        const result = await pending;
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result.map((item) => item.email)).toEqual(['one@example.com', 'two@example.com']);
    });

    it('빈 목록은 요청이나 결과 콜백 없이 빈 결과를 돌려준다', async () => {
        const onResult = vi.fn();
        expect(await runInviteBatch([], onResult)).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(onResult).not.toHaveBeenCalled();
    });

    it('한 번에 100개까지 처리한다', async () => {
        expect(INVITE_BATCH_LIMIT).toBe(100);
        fetchMock.mockImplementation(async () => response({ success: true, emailSent: true }));
        const actions = Array.from({ length: 100 }, (_, index) => issue(`mentee${index}@example.com`));
        const result = await runInviteBatch(actions);
        expect(result).toHaveLength(100);
        expect(result.every((item) => item.status === 'sent')).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(100);
    });

    it('100개를 넘으면 일부를 발급하지 않고 시작 전에 거절한다', async () => {
        const actions = Array.from({ length: 101 }, (_, index) => issue(`mentee${index}@example.com`));
        await expect(runInviteBatch(actions)).rejects.toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('작업 시작 전 화면을 벗어났으면 요청하지 않는다', async () => {
        expect(await runInviteBatch([issue('one@example.com')], undefined, () => false)).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('첫 결과 이후 중단 조건이 생기면 나머지 요청을 시작하지 않는다', async () => {
        let mounted = true;
        const onResult = vi.fn(() => { mounted = false; });
        const result = await runInviteBatch([issue('one@example.com'), issue('two@example.com')], onResult, () => mounted);
        expect(result).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(onResult).toHaveBeenCalledTimes(1);
    });
});
