// 임시 비밀번호 메일 본문이 필요한 것을 담고, 값을 이스케이프하는지 본다.
import { describe, expect, it } from 'vitest';
import { buildTempPasswordEmail } from '../lib/temp-password-email';
import { escapeHtml } from '../lib/html-escape';

const params = {
    tempPassword: 'Abc123!xyz',
    roleLabel: '멘토',
    loginUrl: 'https://example.com/login',
    escapeHtml,
};

describe('buildTempPasswordEmail', () => {
    it('임시 비밀번호와 로그인 주소를 담는다', () => {
        const { subject, html } = buildTempPasswordEmail(params);

        expect(subject).toContain('멘토');
        expect(html).toContain('Abc123!xyz');
        expect(html).toContain('https://example.com/login');
    });

    it('첫 로그인 때 비밀번호를 바꿔야 한다고 알린다', () => {
        expect(buildTempPasswordEmail(params).html).toContain('변경');
    });

    it('역할 이름을 이스케이프한다', () => {
        const injected = buildTempPasswordEmail({ ...params, roleLabel: '<img src=x onerror=alert(1)>' });

        expect(injected.html).not.toContain('<img');
        expect(injected.html).toContain('&lt;img');
    });

    it('임시 비밀번호를 이스케이프한다', () => {
        // 생성 문자에 &, < 가 섞여도 본문이 깨지지 않아야 한다.
        const injected = buildTempPasswordEmail({ ...params, tempPassword: 'a<b&c' });

        expect(injected.html).toContain('a&lt;b&amp;c');
    });
});
