// 로그인 후 되돌아갈 주소가 외부 사이트로 새지 않는지 확인한다.
import { describe, expect, it } from 'vitest';
import { safeReturnUrl } from '../lib/safe-return-url';

describe('safeReturnUrl', () => {
    it('내부 경로는 그대로 둔다', () => {
        expect(safeReturnUrl('/dashboard')).toBe('/dashboard');
        expect(safeReturnUrl('/project/abc?tab=kano')).toBe('/project/abc?tab=kano');
    });

    it('protocol-relative URL 을 막는다', () => {
        // startsWith('/') 만 보던 예전 검사가 이걸 통과시켰다.
        expect(safeReturnUrl('//evil.com')).toBe('/');
        expect(safeReturnUrl('//evil.com/path')).toBe('/');
    });

    it('역슬래시 변형을 막는다', () => {
        // 일부 브라우저가 \ 를 / 로 정규화한다.
        expect(safeReturnUrl('/\\evil.com')).toBe('/');
        expect(safeReturnUrl('\\\\evil.com')).toBe('/');
    });

    it('절대 URL 을 막는다', () => {
        expect(safeReturnUrl('https://evil.com')).toBe('/');
        expect(safeReturnUrl('http://evil.com')).toBe('/');
        expect(safeReturnUrl('javascript:alert(1)')).toBe('/');
    });

    it('비어 있으면 루트로 보낸다', () => {
        expect(safeReturnUrl(null)).toBe('/');
        expect(safeReturnUrl(undefined)).toBe('/');
        expect(safeReturnUrl('')).toBe('/');
    });
});
