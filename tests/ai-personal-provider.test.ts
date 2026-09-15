// personal AI 프로바이더가 개인 키 연결을 사용하고 실패 시 규칙 기반으로 폴백하는지 확인한다.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/service-settings', () => ({
    getAiSettings: vi.fn(async () => ({ provider: 'rule' })),
}));

import { runAiTask } from '../lib/ai/registry';
import { createPersonalProvider, verifyPersonalConnection } from '../lib/ai/personal';

afterEach(() => vi.unstubAllGlobals());

describe('runAiTask personal', () => {
    it('연결이 없으면 규칙 기반으로 폴백하고 이유를 알린다', async () => {
        const outcome = await runAiTask(async (p) => p.id, {
            requested: 'personal',
            personalConnection: null,
        });
        expect(outcome.provider).toBe('rule');
        expect(outcome.degraded).toBe(true);
        expect(outcome.degradedReason).toContain('개인 AI 키');
    });

    it('연결이 있으면 personal 프로바이더로 실행한다', async () => {
        // directEndpoint 라 /models 탐색 없이 chat/completions 만 부른다.
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            choices: [{
                message: {
                    content: JSON.stringify({
                        questions: [{ id: 'q1', field: 'customerNeed', question: '?' }],
                        focus: '',
                    }),
                },
            }],
        }), { status: 200 })));

        const outcome = await runAiTask(
            (p) => p.mentorQuestions({ project: { name: 'T' } }),
            {
                requested: 'personal',
                personalConnection: {
                    mode: 'api',
                    vendor: 'openai',
                    apiKey: 'sk-test',
                    model: null,
                    mcpBaseUrl: null,
                    mcpModel: null,
                    localBaseUrl: null,
                    localModel: null,
                },
            }
        );
        expect(outcome.provider).toBe('personal');
        expect(outcome.degraded).toBe(false);
    });

    it('호출이 실패하면 규칙 기반으로 폴백한다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
        const outcome = await runAiTask(
            (p) => p.mentorQuestions({ project: { name: 'T' } }),
            {
                requested: 'personal',
                personalConnection: {
                    mode: 'api',
                    vendor: 'openai',
                    apiKey: 'sk-test',
                    model: null,
                    mcpBaseUrl: null,
                    mcpModel: null,
                    localBaseUrl: null,
                    localModel: null,
                },
            }
        );
        expect(outcome.provider).toBe('rule');
        expect(outcome.degraded).toBe(true);
    });
});

describe('createPersonalProvider', () => {
    it('벤더 프리셋 주소와 Bearer 키로 호출한다', async () => {
        const calls: Array<{ url: string; init: RequestInit }> = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return new Response(JSON.stringify({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            questions: [{ id: 'q1', field: 'customerNeed', question: '?' }],
                            focus: '',
                        }),
                    },
                }],
            }), { status: 200 });
        }));

        await createPersonalProvider({
            mode: 'api',
            vendor: 'gemini',
            apiKey: 'g-key',
            model: null,
            mcpBaseUrl: null,
            mcpModel: null,
            localBaseUrl: null,
            localModel: null,
        })
            .mentorQuestions({ project: { name: 'T' } });

        expect(calls[0].url).toBe(
            'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
        );
        expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer g-key');
        const body = JSON.parse(String(calls[0].init.body));
        expect(body.model).toBe('gemini-2.0-flash');
    });
});

describe('verifyPersonalConnection', () => {
    it('200 이면 성공이다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
        expect((await verifyPersonalConnection({
            mode: 'api',
            vendor: 'openai',
            apiKey: 'k',
            model: null,
            mcpBaseUrl: null,
            mcpModel: null,
            localBaseUrl: null,
            localModel: null,
        })).ok)
            .toBe(true);
    });

    it('401 은 키 오류 메시지를 준다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
        const result = await verifyPersonalConnection({
            mode: 'api',
            vendor: 'openai',
            apiKey: 'bad',
            model: null,
            mcpBaseUrl: null,
            mcpModel: null,
            localBaseUrl: null,
            localModel: null,
        });
        expect(result.ok).toBe(false);
        expect(result.message).toContain('키가 유효하지 않습니다');
    });

    it('Gemini의 알려진 키 오류는 고정 안내로 바꾸고 원문을 숨긴다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: {
                message: 'vendor-detail-must-not-leak',
                details: [{ reason: 'API_KEY_INVALID' }],
            },
        }), { status: 400 })));

        const result = await verifyPersonalConnection({
            mode: 'api',
            vendor: 'gemini',
            apiKey: 'AIza-test-key',
            model: null,
            mcpBaseUrl: null,
            mcpModel: null,
            localBaseUrl: null,
            localModel: null,
        });

        expect(result).toEqual({
            ok: false,
            message: 'Gemini API 키가 유효하지 않습니다. Google AI Studio에서 새 키를 저장하세요.',
        });
        expect(JSON.stringify(result)).not.toContain('vendor-detail-must-not-leak');
        expect(JSON.stringify(result)).not.toContain('AIza-test-key');
    });

    it('Gemini 키 제한과 이용 조건은 각각 고정 안내로 바꾼다', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { details: [{ reason: 'API_KEY_SERVICE_BLOCKED' }] },
            }), { status: 400 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: {
                    status: 'FAILED_PRECONDITION',
                    message: 'vendor-detail-must-not-leak',
                },
            }), { status: 400 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { details: [{ reason: 'FAILED_PRECONDITION' }] },
            }), { status: 400 }));
        vi.stubGlobal('fetch', fetchMock);

        const connection = {
            mode: 'api' as const,
            vendor: 'gemini' as const,
            apiKey: 'AIza-test-key',
            model: null,
            mcpBaseUrl: null,
            mcpModel: null,
            localBaseUrl: null,
            localModel: null,
        };

        await expect(verifyPersonalConnection(connection)).resolves.toEqual({
            ok: false,
            message: 'Gemini API 사용이 제한되어 있습니다. Google AI Studio에서 키 제한을 확인하거나 새 키를 저장하세요.',
        });
        const preconditionResult = await verifyPersonalConnection(connection);
        expect(preconditionResult).toEqual({
            ok: false,
            message: 'Gemini API 이용 조건을 확인하세요. 지원 지역 또는 결제 설정이 필요할 수 있습니다.',
        });
        expect(JSON.stringify(preconditionResult)).not.toContain('vendor-detail-must-not-leak');
        await expect(verifyPersonalConnection(connection)).resolves.toEqual({
            ok: false,
            message: 'Gemini API 이용 조건을 확인하세요. 지원 지역 또는 결제 설정이 필요할 수 있습니다.',
        });
    });

    it('알 수 없거나 JSON이 아닌 Gemini 400은 일반 안내로 끝낸다', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: {
                    message: 'vendor-detail-must-not-leak',
                    details: [{ reason: 'toString' }],
                },
            }), { status: 400 }))
            .mockResolvedValueOnce(new Response('vendor-detail-must-not-leak', { status: 400 }));
        vi.stubGlobal('fetch', fetchMock);

        const connection = {
            mode: 'api' as const,
            vendor: 'gemini' as const,
            apiKey: 'AIza-test-key',
            model: null,
            mcpBaseUrl: null,
            mcpModel: null,
            localBaseUrl: null,
            localModel: null,
        };
        const expected = {
            ok: false,
            message: 'Gemini가 요청을 거부했습니다. API 키와 모델을 확인하세요.',
        };

        await expect(verifyPersonalConnection(connection)).resolves.toEqual(expected);
        await expect(verifyPersonalConnection(connection)).resolves.toEqual(expected);
    });

    it('다른 벤더의 400은 기존 일반 안내를 유지한다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: { details: [{ reason: 'API_KEY_INVALID' }] },
        }), { status: 400 })));

        await expect(verifyPersonalConnection({
            mode: 'api',
            vendor: 'openai',
            apiKey: 'sk-test-key',
            model: null,
            mcpBaseUrl: null,
            mcpModel: null,
            localBaseUrl: null,
            localModel: null,
        })).resolves.toEqual({
            ok: false,
            message: '벤더 응답 오류 (HTTP 400)',
        });
    });

    it('네트워크 실패도 ok:false 로 끝난다(던지지 않는다)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('ECONNREFUSED');
        }));
        const result = await verifyPersonalConnection({
            mode: 'api',
            vendor: 'anthropic',
            apiKey: 'k',
            model: null,
            mcpBaseUrl: null,
            mcpModel: null,
            localBaseUrl: null,
            localModel: null,
        });
        expect(result.ok).toBe(false);
    });
});
