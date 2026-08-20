import { describe, expect, it, vi } from 'vitest';
import { errorCodeOf, toErrorResponse } from '../lib/api-error';

function loggerSpy() {
    return { error: vi.fn() };
}

describe('errorCodeOf', () => {
    it('Prisma 오류의 code 를 읽는다', () => {
        expect(errorCodeOf(Object.assign(new Error('fk'), { code: 'P2003' }))).toBe('P2003');
    });

    it('code 가 없으면 null', () => {
        expect(errorCodeOf(new Error('plain'))).toBeNull();
        expect(errorCodeOf('string error')).toBeNull();
        expect(errorCodeOf(null)).toBeNull();
    });
});

describe('toErrorResponse', () => {
    it('내부 메시지를 응답에 담지 않는다', async () => {
        const log = loggerSpy();
        const internal = new Error(
            'Invalid `prisma.kanoResponse.createMany()` invocation: Foreign key constraint failed on the field: `requirementId`'
        );

        const response = toErrorResponse(internal, { log, message: '응답 제출에 실패했습니다.' });
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBe('응답 제출에 실패했습니다.');
        expect(JSON.stringify(body)).not.toContain('prisma');
        expect(JSON.stringify(body)).not.toContain('requirementId');
        expect(JSON.stringify(body)).not.toContain('Foreign key');
    });

    it('상관 ID 를 응답과 로그 양쪽에 남긴다', async () => {
        const log = loggerSpy();

        const response = toErrorResponse(new Error('boom'), { log, message: '실패했습니다.' });
        const body = await response.json();

        expect(body.referenceId).toMatch(/^[0-9a-f]{8}$/);
        expect(log.error).toHaveBeenCalledTimes(1);
        const [, , meta] = log.error.mock.calls[0];
        expect(meta.referenceId).toBe(body.referenceId);
    });

    it('원본 오류와 코드를 로그로 넘긴다', () => {
        const log = loggerSpy();
        const internal = Object.assign(new Error('fk'), { code: 'P2003' });

        toErrorResponse(internal, { log, message: '실패했습니다.', context: { projectId: 'p1' } });

        const [message, error, meta] = log.error.mock.calls[0];
        expect(message).toBe('실패했습니다.');
        expect(error).toBe(internal);
        expect(meta).toMatchObject({ code: 'P2003', projectId: 'p1' });
    });

    it('호출마다 다른 상관 ID 를 만든다', async () => {
        const log = loggerSpy();

        const a = await toErrorResponse(new Error('a'), { log, message: 'x' }).json();
        const b = await toErrorResponse(new Error('b'), { log, message: 'x' }).json();

        expect(a.referenceId).not.toBe(b.referenceId);
    });
});
