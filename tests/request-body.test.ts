// 깨진 JSON 본문을 서버 오류(500)가 아니라 잘못된 요청(400)으로 구분하는지 확인한다
// (2026-10-25 코드 리뷰 B25).
import { describe, expect, it, vi } from 'vitest';
import { InvalidJsonBodyError, invalidJsonBodyResponse, readJsonBody } from '../lib/request-body';
import { toErrorResponse } from '../lib/api-error';

const post = (body: string) => new Request('http://localhost/api/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
});

describe('readJsonBody', () => {
    it('올바른 JSON 은 request.json() 과 같은 값을 돌려준다', async () => {
        expect(await readJsonBody(post('{"a":1,"b":[true,null]}'))).toEqual({ a: 1, b: [true, null] });
    });

    it.each(['{', 'not-json', '', '{"id":'])('깨진 본문 %j 은 InvalidJsonBodyError 를 던진다', async (body) => {
        await expect(readJsonBody(post(body))).rejects.toBeInstanceOf(InvalidJsonBodyError);
    });
});

describe('invalidJsonBodyResponse', () => {
    it('본문 해석 실패는 400 과 안내 문구로 바꾼다', async () => {
        const res = invalidJsonBodyResponse(new InvalidJsonBodyError());

        expect(res?.status).toBe(400);
        expect(await res?.json()).toEqual({ error: '요청 본문이 올바른 JSON 형식이 아닙니다.' });
    });

    it.each([new SyntaxError('stored data'), new Error('db down'), null])('다른 오류(%s)는 건드리지 않는다', (error) => {
        expect(invalidJsonBodyResponse(error)).toBeNull();
    });
});

describe('toErrorResponse 와 깨진 본문', () => {
    it('깨진 본문은 오류 로그 없이 400 으로 답한다', async () => {
        const log = { error: vi.fn() };
        const res = toErrorResponse(new InvalidJsonBodyError(), { log, message: '저장 실패' });

        expect(res.status).toBe(400);
        expect(log.error).not.toHaveBeenCalled();
        expect(await res.json()).not.toHaveProperty('referenceId');
    });

    it('서버 내부의 SyntaxError 는 여전히 500 이다', () => {
        const log = { error: vi.fn() };

        expect(toErrorResponse(new SyntaxError('Unexpected token'), { log, message: '저장 실패' }).status).toBe(500);
        expect(log.error).toHaveBeenCalledTimes(1);
    });
});
