// 화면 공용 응답 처리(2026-10-25 코드 리뷰 D3): 실패 문구 규칙과 401·403 판정.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkPageAccess, readJsonOrThrow, redirectToLoginOn401 } from '../lib/client-fetch';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('readJsonOrThrow', () => {
    it('성공 응답은 본문을 돌려준다', async () => {
        expect(await readJsonOrThrow(json({ items: [1] }), '실패')).toEqual({ items: [1] });
    });

    it('실패 응답은 서버가 준 문구로 던진다', async () => {
        await expect(readJsonOrThrow(json({ error: '권한이 없습니다.' }, 403), '기본 문구')).rejects.toThrow('권한이 없습니다.');
    });

    it('서버 문구가 없거나 본문이 JSON 이 아니면 기본 문구로 던진다', async () => {
        await expect(readJsonOrThrow(json({}, 500), '기본 문구')).rejects.toThrow('기본 문구');
        await expect(readJsonOrThrow(new Response('<html>오류</html>', { status: 502 }), '기본 문구')).rejects.toThrow('기본 문구');
    });

    it('성공인데 본문이 JSON 이 아니면 null 을 돌려준다', async () => {
        expect(await readJsonOrThrow(new Response('', { status: 200 }), '실패')).toBeNull();
    });
});

describe('401·403 판정', () => {
    function stubLocation() {
        const replace = vi.fn();
        vi.stubGlobal('window', { location: { replace } });
        return replace;
    }

    it('401 은 로그인으로 보낸다', () => {
        const replace = stubLocation();

        expect(redirectToLoginOn401({ status: 401 })).toBe(true);
        expect(checkPageAccess({ status: 401 })).toBe('redirected');
        expect(replace).toHaveBeenCalledWith('/login');
    });

    it('403 은 거부, 그 밖은 허용이며 로그인으로 보내지 않는다', () => {
        const replace = stubLocation();

        expect(checkPageAccess({ status: 403 })).toBe('denied');
        expect(checkPageAccess({ status: 200 })).toBe('allowed');
        expect(checkPageAccess({ status: 500 })).toBe('allowed');
        expect(redirectToLoginOn401({ status: 403 })).toBe(false);
        expect(replace).not.toHaveBeenCalled();
    });
});
