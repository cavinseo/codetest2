// 개인 AI 벤더 프리셋의 고정 계약을 검증하는 테스트다.
import { describe, expect, it } from 'vitest';
import {
    PERSONAL_AI_VENDORS, PERSONAL_AI_VENDOR_LABELS, PERSONAL_AI_VENDOR_PRESETS,
    parsePersonalAiVendor, resolvePersonalModel,
} from '../lib/ai/personal-vendors';

describe('벤더 목록', () => {
    it('세 벤더만 허용한다', () => {
        expect(PERSONAL_AI_VENDORS).toEqual(['openai', 'anthropic', 'gemini']);
    });

    it('벤더마다 라벨·주소·기본 모델이 있다', () => {
        for (const vendor of PERSONAL_AI_VENDORS) {
            expect(PERSONAL_AI_VENDOR_LABELS[vendor]).toBeTruthy();
            expect(PERSONAL_AI_VENDOR_PRESETS[vendor].baseUrl).toMatch(/^https:\/\//);
            expect(PERSONAL_AI_VENDOR_PRESETS[vendor].defaultModel).toBeTruthy();
        }
    });

    it('주소는 https 고정 프리셋이다(자유 입력 불가 — SSRF 차단)', () => {
        expect(PERSONAL_AI_VENDOR_PRESETS.openai.baseUrl).toBe('https://api.openai.com/v1');
        expect(PERSONAL_AI_VENDOR_PRESETS.anthropic.baseUrl).toBe('https://api.anthropic.com/v1');
        expect(PERSONAL_AI_VENDOR_PRESETS.gemini.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    });
});

describe('parsePersonalAiVendor', () => {
    it('알려진 벤더만 통과시킨다', () => {
        expect(parsePersonalAiVendor('openai')).toBe('openai');
        expect(parsePersonalAiVendor('anthropic')).toBe('anthropic');
        expect(parsePersonalAiVendor('gemini')).toBe('gemini');
    });

    it('모르는 값은 null 이다', () => {
        expect(parsePersonalAiVendor('azure')).toBeNull();
        expect(parsePersonalAiVendor('')).toBeNull();
        expect(parsePersonalAiVendor(null)).toBeNull();
        expect(parsePersonalAiVendor(undefined)).toBeNull();
        expect(parsePersonalAiVendor(1)).toBeNull();
    });
});

describe('resolvePersonalModel', () => {
    it('지정한 모델을 다듬어 쓴다', () => {
        expect(resolvePersonalModel('openai', ' gpt-4o ')).toBe('gpt-4o');
    });

    it('비어 있으면 벤더 기본 모델이다', () => {
        expect(resolvePersonalModel('openai', '')).toBe('gpt-4o-mini');
        expect(resolvePersonalModel('anthropic', '   ')).toBe('claude-haiku-4-5');
        expect(resolvePersonalModel('gemini', null)).toBe('gemini-2.0-flash');
        expect(resolvePersonalModel('gemini', undefined)).toBe('gemini-2.0-flash');
    });
});
