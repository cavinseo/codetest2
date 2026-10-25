// OpenAI 호환 엔진이 헤더만 보내고 본문을 끝내지 않아도 시간 제한 안에 포기하는지 확인한다
// (2026-10-25 코드 리뷰 B26).
import { describe, expect, it, vi } from 'vitest';
import { AiProviderError, createOpenAiCompatibleProvider } from '../lib/ai/openai-compatible';

// 헤더(200)는 바로 오지만 본문 스트림이 끝나지 않는 응답. 예전에는 response.json() 이 영원히 기다렸다.
const stalledBody = () => new Response(new ReadableStream({ start() { /* 끝내지 않는다 */ } }), { status: 200 });
const okJson = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });

function provider(transport: (url: string, init: RequestInit) => Promise<Response>, directEndpoint = true) {
    return createOpenAiCompatibleProvider({
        id: 'local', label: '테스트 엔진', baseUrls: ['http://localhost:11434/v1'],
        model: 'test', directEndpoint, timeoutMs: 50, fetch: transport,
    });
}

describe('본문 읽기 시간 제한 (B26)', () => {
    it('응답 본문이 끝나지 않으면 시간 제한 뒤 오류로 끝낸다', async () => {
        const transport = vi.fn(async () => stalledBody());

        const result = provider(transport).mentorQuestions({ project: { name: '테스트' } });

        await expect(result).rejects.toBeInstanceOf(AiProviderError);
        await expect(result).rejects.toThrow('응답 시간이 초과되었습니다.');
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it('헤더조차 오지 않아도 시간 제한 뒤 오류로 끝낸다', async () => {
        const transport = vi.fn(() => new Promise<Response>(() => undefined));

        await expect(provider(transport).mentorQuestions({ project: { name: '테스트' } }))
            .rejects.toThrow('응답 시간이 초과되었습니다.');
    });

    it('모델 탐색에서 본문이 멈춰도 연결 불가로 판단하고 끝낸다', async () => {
        const transport = vi.fn(async () => stalledBody());

        await expect(provider(transport, false).isAvailable()).resolves.toBe(false);
        // OpenAI 호환 경로와 네이티브 경로를 한 번씩 시도한다.
        expect(transport).toHaveBeenCalledTimes(2);
    });

    it('제때 온 응답은 그대로 해석한다', async () => {
        const expected = { questions: [{ id: 'q1', field: 'customerName', question: '누가 쓰나요?' }], focus: '고객' };
        const transport = vi.fn(async () => okJson({ choices: [{ message: { content: JSON.stringify(expected) } }] }));

        const result = await provider(transport).mentorQuestions({ project: { name: '테스트' } });

        expect(result.focus).toBe('고객');
    });

    it('HTTP 오류 응답은 본문을 기다리지 않고 상태 코드로 알린다', async () => {
        const transport = vi.fn(async () => new Response(new ReadableStream({ start() { /* 끝내지 않는다 */ } }), { status: 503 }));

        await expect(provider(transport).mentorQuestions({ project: { name: '테스트' } }))
            .rejects.toThrow('HTTP 503');
    });
});
