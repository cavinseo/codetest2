// 다중 이메일 발급의 주소 정리·순차 실행·부분 실패·중단 조건을 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INVITE_BATCH_LIMIT, parseInviteEmails, runInviteBatch } from '../lib/invite-batch';

const fetchMock = vi.fn();
const issue = (email: string) => ({ kind: 'issue' as const, email, programId: 'program_1', expiresAt: '2026-12-31' });

function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async () => response({ success: true, emailSent: true, code: 'CODE-1234' }));
});

afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

describe('다중 이메일 입력', () => {
    it('줄바꿈·공백·쉼표·세미콜론으로 나눈 주소를 소문자로 정리한다', () => {
        expect(parseInviteEmails('  ONE@Example.com\r\ntwo@example.com,THREE@example.com;four@example.com\tfive@example.com  ')).toEqual({
            emails: ['one@example.com', 'two@example.com', 'three@example.com', 'four@example.com', 'five@example.com'],
            invalid: [], duplicateCount: 0,
        });
    });

    it('대소문자가 다른 같은 유효 주소는 한 번만 남기고 잘못된 주소는 별도로 보존한다', () => {
        expect(parseInviteEmails('A@example.com a@EXAMPLE.com A@example.com invalid invalid')).toEqual({
            emails: ['a@example.com'], invalid: ['invalid', 'invalid'], duplicateCount: 2,
        });
    });

    it('유효한 주소와 잘못된 주소를 분리한다', () => {
        expect(parseInviteEmails('missing-at example@ user@example.com another@.com')).toEqual({
            emails: ['user@example.com'], invalid: ['missing-at', 'example@', 'another@.com'], duplicateCount: 0,
        });
    });

    it('빈 입력과 연속 구분자를 발급 대상으로 만들지 않는다', () => {
        expect(parseInviteEmails(' \n\r\t,;; ')).toEqual({ emails: [], invalid: [], duplicateCount: 0 });
    });
});

describe('다중 발급 처리', () => {
    it('멘티 역할과 선택 프로그램·기한을 단건 POST로 보내고 메일 성공 코드도 결과에 보존한다', async () => {
        const result = await runInviteBatch([issue('one@example.com')]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/invites');
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({ email: 'one@example.com', role: 'MENTEE', programId: 'program_1', expiresAt: '2026-12-31' });
        expect(result).toEqual([expect.objectContaining({ email: 'one@example.com', status: 'sent', code: 'CODE-1234' })]);
    });

    it('메일 실패는 발급 성공으로 구분하고 직접 전달할 코드를 보존한다', async () => {
        fetchMock.mockResolvedValueOnce(response({ success: true, emailSent: false, code: 'MAIL-FAILED-CODE' }));
        expect(await runInviteBatch([issue('one@example.com')])).toEqual([
            expect.objectContaining({ email: 'one@example.com', status: 'issued', code: 'MAIL-FAILED-CODE', message: expect.any(String) }),
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        [409, { success: false, error: '이미 가입된 이메일입니다.' }],
        [500, { error: '서버 오류입니다.' }],
        [200, { success: false, error: '처리할 수 없습니다.' }],
    ])('HTTP %i 응답의 실패 내용을 해당 이메일 결과에 남기고 다음 발급을 계속한다', async (status, body) => {
        fetchMock.mockResolvedValueOnce(response(body, status));
        const result = await runInviteBatch([issue('one@example.com'), issue('two@example.com')]);
        expect(result[0]).toMatchObject({ email: 'one@example.com', status: 'failed', message: body.error });
        expect(result[1]).toMatchObject({ email: 'two@example.com', status: 'sent' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('네트워크 실패 후 다음 항목을 처리하며 실패 요청은 자동 재시도하지 않는다', async () => {
        fetchMock.mockRejectedValueOnce(new Error('network unavailable'));
        const onResult = vi.fn();
        const result = await runInviteBatch([issue('one@example.com'), issue('two@example.com')], onResult);
        expect(result.map((item) => item.status)).toEqual(['failed', 'sent']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(onResult.mock.calls.map((call) => call[0])).toEqual(result);
    });

    it('HTML 오류 응답이 와도 뒤의 유효 발급을 계속한다', async () => {
        fetchMock.mockResolvedValueOnce(new Response('<html>Gateway Error</html>', { status: 502 }));
        expect((await runInviteBatch([issue('one@example.com'), issue('two@example.com')])).map((item) => item.status))
            .toEqual(['failed', 'sent']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('첫 응답이 완료되기 전에는 두 번째 발급을 시작하지 않는다', async () => {
        let finishFirst!: (value: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishFirst = resolve; }));
        const pending = runInviteBatch([issue('one@example.com'), issue('two@example.com')]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        finishFirst(response({ success: true, emailSent: true, code: 'FIRST' }));
        const result = await pending;
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result.map((item) => item.email)).toEqual(['one@example.com', 'two@example.com']);
    });

    it('빈 목록은 요청하거나 결과 콜백을 호출하지 않는다', async () => {
        const onResult = vi.fn();
        expect(await runInviteBatch([], onResult)).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(onResult).not.toHaveBeenCalled();
    });

    it('100명까지 처리하고 101명은 요청 시작 전에 거절한다', async () => {
        expect(INVITE_BATCH_LIMIT).toBe(100);
        const actions = Array.from({ length: 100 }, (_, index) => issue(`mentee${index}@example.com`));
        expect(await runInviteBatch(actions)).toHaveLength(100);
        expect(fetchMock).toHaveBeenCalledTimes(100);
        fetchMock.mockClear();
        await expect(runInviteBatch([...actions, issue('excess@example.com')])).rejects.toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('이미 화면을 벗어났으면 발급을 시작하지 않는다', async () => {
        expect(await runInviteBatch([issue('one@example.com')], undefined, () => false)).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('첫 결과 이후 중단 조건이 생기면 남은 발급을 시작하지 않는다', async () => {
        let active = true;
        const onResult = vi.fn(() => { active = false; });
        expect(await runInviteBatch([issue('one@example.com'), issue('two@example.com')], onResult, () => active)).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(onResult).toHaveBeenCalledTimes(1);
    });
});
