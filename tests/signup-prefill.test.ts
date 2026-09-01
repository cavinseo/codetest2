// Google 로그인 → 가입 화면 이메일 프리필의 쿠키 읽기 규칙.
//
// 쿠키 파싱은 조용히 틀리기 쉽다. 이름이 부분 일치하거나, 값에 '=' 가 들어 있거나,
// 인코딩이 깨진 경우가 전부 "그럴듯하게 틀린" 결과를 낸다.
import { describe, expect, it } from 'vitest';
import { readCookieValue, readSignupEmail, SIGNUP_EMAIL_COOKIE } from '../lib/signup-prefill';

describe('readCookieValue', () => {
    it('이름이 정확히 같은 쿠키만 읽는다', () => {
        expect(readCookieValue('a=1; google_signup_email=u%40x.com; b=2', SIGNUP_EMAIL_COOKIE))
            .toBe('u@x.com');
    });

    it('이름이 부분 일치하는 쿠키에 속지 않는다', () => {
        // includes 로 찾으면 여기서 걸린다.
        const cookies = 'other_google_signup_email=attacker%40evil.com';

        expect(readCookieValue(cookies, SIGNUP_EMAIL_COOKIE)).toBeNull();
    });

    it('접두사가 붙은 이름에도 속지 않는다', () => {
        expect(readCookieValue('google_signup_email_backup=u%40x.com', SIGNUP_EMAIL_COOKIE))
            .toBeNull();
    });

    it('첫 = 만 구분자로 쓴다', () => {
        // base64 값처럼 '=' 로 끝나는 값이 잘리면 안 된다.
        expect(readCookieValue('t=abc==', 't')).toBe('abc==');
    });

    it('앞뒤 공백이 있어도 찾는다', () => {
        expect(readCookieValue('a=1;   google_signup_email=u%40x.com', SIGNUP_EMAIL_COOKIE))
            .toBe('u@x.com');
    });

    it('빈 문자열·없는 이름은 null 이다', () => {
        expect(readCookieValue('', SIGNUP_EMAIL_COOKIE)).toBeNull();
        expect(readCookieValue('a=1; b=2', SIGNUP_EMAIL_COOKIE)).toBeNull();
    });

    it('이름이 없는 조각은 건너뛴다', () => {
        expect(readCookieValue('=1; google_signup_email=u%40x.com', SIGNUP_EMAIL_COOKIE))
            .toBe('u@x.com');
    });

    it('인코딩이 깨진 값은 null 이다', () => {
        // 빈 입력란이 잘못된 입력란보다 낫다.
        expect(readCookieValue('google_signup_email=%E0%A4%A', SIGNUP_EMAIL_COOKIE)).toBeNull();
    });
});

describe('readSignupEmail', () => {
    it('정상 이메일을 돌려준다', () => {
        expect(readSignupEmail('google_signup_email=user%40example.com')).toBe('user@example.com');
    });

    it('앞뒤 공백을 다듬는다', () => {
        expect(readSignupEmail('google_signup_email=%20user%40example.com%20')).toBe('user@example.com');
    });

    it('쿠키가 없으면 null 이다', () => {
        expect(readSignupEmail('')).toBeNull();
        expect(readSignupEmail('a=1')).toBeNull();
    });

    it('이메일 형태가 아니면 null 이다', () => {
        // 쿠키는 손으로 바꿀 수 있다. 특권은 없지만 입력란은 지킨다.
        for (const bad of ['plain', 'no-at.com', 'a@b', 'a@@b.com', '@x.com', 'a@x']) {
            expect(readSignupEmail(`google_signup_email=${encodeURIComponent(bad)}`)).toBeNull();
        }
    });

    it('공백이 섞인 값은 이메일이 아니다', () => {
        expect(readSignupEmail(`google_signup_email=${encodeURIComponent('a b@x.com')}`)).toBeNull();
    });

    it('지나치게 긴 값은 null 이다', () => {
        const long = `${'a'.repeat(250)}@x.com`;

        expect(readSignupEmail(`google_signup_email=${encodeURIComponent(long)}`)).toBeNull();
    });

    it('빈 값은 null 이다', () => {
        expect(readSignupEmail('google_signup_email=')).toBeNull();
        expect(readSignupEmail(`google_signup_email=${encodeURIComponent('   ')}`)).toBeNull();
    });
});
