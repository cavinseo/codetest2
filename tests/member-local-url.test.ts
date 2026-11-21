// 회원이 적는 로컬 AI 주소를 로컬 LLM 포트와 /v1 경로로만 좁히는지 본다(감리 B9).
// 서버가 이 주소로 요청을 보내므로, 넓게 열면 서버 자신의 내부 포트를 두드리게 된다.
import { describe, expect, it } from 'vitest';
import {
    assertMemberLocalBaseUrl,
    MEMBER_LOCAL_AI_PORTS,
    MEMBER_LOCAL_AI_URL_RULE,
    memberLocalBaseUrlOrNull,
} from '../lib/ai/member-local-url';
import { AiProviderError } from '../lib/ai/openai-compatible';

describe('assertMemberLocalBaseUrl', () => {
    it.each([
        ['http://localhost:11434/v1', 'http://localhost:11434/v1'],
        ['http://localhost:1234/v1/', 'http://localhost:1234/v1'],
        ['http://127.0.0.1:8000/v1', 'http://127.0.0.1:8000/v1'],
        ['http://[::1]:8080/v1', 'http://[::1]:8080/v1'],
        ['http://localhost:11434', 'http://localhost:11434'],
        ['http://localhost:11434/', 'http://localhost:11434'],
    ])('%s 은 허용하고 %s 로 맞춘다', (input, normalized) => {
        expect(assertMemberLocalBaseUrl(input)).toBe(normalized);
    });

    it.each([
        ['원격 호스트', 'http://example.com:11434/v1'],
        ['사설망 주소', 'http://192.168.0.10:11434/v1'],
        ['0.0.0.0', 'http://0.0.0.0:11434/v1'],
        ['내부 서비스 포트', 'http://localhost:6379/v1'],
        ['포트 생략', 'http://localhost/v1'],
        ['https', 'https://localhost:11434/v1'],
        ['다른 프로토콜', 'ftp://localhost:11434/v1'],
        ['다른 경로', 'http://localhost:11434/admin'],
        ['/v1 아래 경로', 'http://localhost:11434/v1/models'],
        ['질의 문자열', 'http://localhost:11434/v1?x=1'],
        ['조각', 'http://localhost:11434/v1#x'],
        ['사용자 이름', 'http://user@localhost:11434/v1'],
        ['비밀번호', 'http://user:pw@localhost:11434/v1'],
        ['주소가 아님', 'not a url'],
    ])('%s 는 거절한다', (_label, input) => {
        expect(() => assertMemberLocalBaseUrl(input)).toThrow(AiProviderError);
        expect(() => assertMemberLocalBaseUrl(input)).toThrow(MEMBER_LOCAL_AI_URL_RULE);
    });

    it('안내 문구에 허용 포트를 모두 적는다', () => {
        for (const port of MEMBER_LOCAL_AI_PORTS) expect(MEMBER_LOCAL_AI_URL_RULE).toContain(port);
        expect(MEMBER_LOCAL_AI_URL_RULE).toContain('11434·1234·8000·8080');
    });
});

describe('memberLocalBaseUrlOrNull', () => {
    it('규칙에 맞으면 정규화 주소를 돌려준다', () => {
        expect(memberLocalBaseUrlOrNull('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1');
    });

    it.each([null, undefined, '', 'http://localhost:6379/x'])('비었거나 규칙에 맞지 않으면(%j) null', (value) => {
        expect(memberLocalBaseUrlOrNull(value)).toBeNull();
    });
});
