import { describe, expect, it } from 'vitest';
import { runAiTask } from '../lib/ai/registry';
import { ruleProvider } from '../lib/ai/provider-rule';
import { assertAllowedBaseUrl, AiProviderError } from '../lib/ai/openai-compatible';
import type { AiProvider, AiProviderId } from '../lib/ai/types';

function stubProvider(id: AiProviderId, overrides: Partial<AiProvider> = {}): AiProvider {
    return {
        id,
        label: id,
        isAvailable: async () => true,
        mentorQuestions: async () => ({ questions: [], focus: id }),
        attributeDraft: async () => ({ rows: [], issues: [] }),
        ...overrides,
    };
}

function resolverFor(provider: AiProvider) {
    return (id: AiProviderId): AiProvider => (id === 'rule' ? ruleProvider : provider);
}

describe('AI 프로바이더 폴백', () => {
    it('rule 을 요청하면 폴백 없이 규칙 엔진을 쓴다', async () => {
        const outcome = await runAiTask((provider) => provider.mentorQuestions({ project: { name: '테스트' } }), {
            requested: 'rule',
        });

        expect(outcome.provider).toBe('rule');
        expect(outcome.degraded).toBe(false);
        expect(outcome.result.questions.length).toBeGreaterThan(0);
    });

    it('연결되는 엔진은 그대로 사용한다', async () => {
        const outcome = await runAiTask((provider) => provider.mentorQuestions({ project: { name: '테스트' } }), {
            requested: 'local',
            resolveProvider: resolverFor(stubProvider('local')),
        });

        expect(outcome.provider).toBe('local');
        expect(outcome.degraded).toBe(false);
        expect(outcome.result.focus).toBe('local');
    });

    it('health check 에 실패하면 규칙 엔진으로 폴백한다', async () => {
        const outcome = await runAiTask((provider) => provider.mentorQuestions({ project: { name: '테스트' } }), {
            requested: 'hermes',
            resolveProvider: resolverFor(stubProvider('hermes', { isAvailable: async () => false })),
        });

        expect(outcome.provider).toBe('rule');
        expect(outcome.requestedProvider).toBe('hermes');
        expect(outcome.degraded).toBe(true);
        expect(outcome.result.questions.length).toBeGreaterThan(0);
    });

    it('호출 도중 실패해도 규칙 엔진 결과를 돌려준다', async () => {
        const outcome = await runAiTask((provider) => provider.mentorQuestions({ project: { name: '테스트' } }), {
            requested: 'local',
            resolveProvider: resolverFor(stubProvider('local', {
                mentorQuestions: async () => {
                    throw new Error('스키마 불일치');
                },
            })),
        });

        expect(outcome.provider).toBe('rule');
        expect(outcome.degraded).toBe(true);
        expect(outcome.degradedReason).toBe('스키마 불일치');
    });

    it('프로바이더 생성 자체가 실패해도 폴백한다', async () => {
        const outcome = await runAiTask((provider) => provider.mentorQuestions({ project: { name: '테스트' } }), {
            requested: 'api',
            resolveProvider: (id) => {
                if (id === 'rule') return ruleProvider;
                throw new Error('엔드포인트 미설정');
            },
        });

        expect(outcome.provider).toBe('rule');
        expect(outcome.degraded).toBe(true);
        expect(outcome.degradedReason).toBe('엔드포인트 미설정');
    });
});

describe('로컬 엔드포인트 SSRF 차단', () => {
    it('localhost 주소는 허용한다', () => {
        expect(assertAllowedBaseUrl('http://localhost:11434/v1').hostname).toBe('localhost');
        expect(assertAllowedBaseUrl('http://127.0.0.1:8080/v1').hostname).toBe('127.0.0.1');
    });

    it('로컬 엔진에 외부 호스트를 넣으면 막는다', () => {
        expect(() => assertAllowedBaseUrl('https://evil.example.com/v1')).toThrow(AiProviderError);
    });

    it('클라우드 API 는 외부 호스트를 허용한다', () => {
        expect(assertAllowedBaseUrl('https://api.example.com/v1', true).hostname).toBe('api.example.com');
    });

    it('http/https 가 아닌 프로토콜은 막는다', () => {
        expect(() => assertAllowedBaseUrl('file:///etc/passwd', true)).toThrow(AiProviderError);
    });
});
