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

    it('제어문자를 섞은 우회를 막는다', () => {
        // URL 파서는 구조 분석 전에 탭(U+0009)·LF(U+000A)·CR(U+000D)을 입력 전체에서
        // 제거한다. raw[0]/raw[1]만 문자 그대로 보는 검사는 파서가 실제로 보는
        // 문자열과 다른 것을 검사하는 셈이라, "/\t/evil.com" 같은 페이로드가 이 검사를
        // 통과한 뒤 new URL() 안에서 "//evil.com" 으로 붕괴해 호스트가 바뀐다.
        expect(safeReturnUrl('/\t/evil.com')).toBe('/');
        expect(safeReturnUrl('/\n/evil.com')).toBe('/');
        expect(safeReturnUrl('/\r/evil.com')).toBe('/');
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
