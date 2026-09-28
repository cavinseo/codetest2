// 가치 분석의 입력 근거, 응답 계약, AI 호출과 실패 시 기본 분석을 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/service-settings', () => ({ getAiSettings: async () => ({ provider: 'rule' }) }));
import { generateValueAnalysis } from '../lib/attribute-value-analysis';
import { buildValueAnalysisPrompts } from '../lib/ai/prompts';
import { createOpenAiCompatibleProvider } from '../lib/ai/openai-compatible';
import { ruleProvider } from '../lib/ai/provider-rule';
import { runAiTask } from '../lib/ai/registry';
import { valueAnalysisResultSchema, type ValueAnalysisInput } from '../lib/ai/types';

const input: ValueAnalysisInput = {
    project: { name: '정밀가공 프로젝트', description: '무인 가공 솔루션', detailedDescription: '양면 유로 가공' },
    productName: '금속분리판 제조 장치',
    existingRows: [{ marketSegment: '연료전지 제조', customerName: '생산 담당자', customerNeed: '불량 조기 감지', benefit: '재작업 절감', attribute: '자동 보정', techCapability: 'CNC 제어' }],
    specFunctions: [{ name: '양면 가공', level: 'SUB', technology: '동기 제어' }],
    answers: { expectedBenefits: '생산 시간 절감' },
};

afterEach(() => vi.unstubAllGlobals());

describe('제품 가치 분석', () => {
    it('기본 분석이 해당 제품·고객·기술에 연결되며 본원·지원활동과 외부 흐름을 구분한다', () => {
        const result = valueAnalysisResultSchema.parse(generateValueAnalysis(input));
        expect(result.summary).toContain(input.productName);
        expect(result.valueChain.filter(item => item.category === 'primary')).toHaveLength(5);
        expect(result.valueChain.filter(item => item.category === 'support')).toHaveLength(4);
        expect(result.valueSystem.map(item => item.position)).toEqual(['upstream', 'company', 'downstream', 'customer', 'partner']);
        const text = JSON.stringify(result);
        for (const value of ['생산 담당자', '불량 조기 감지', '재작업 절감', '자동 보정', 'CNC 제어', '동기 제어', '생산 시간 절감']) expect(text).toContain(value);
        expect(result.assumptions.join(' ')).toContain('실제 업체와 존재 여부');
    });

    it('최소 입력에서도 제품명을 사용하고 미확인 항목을 명시한다', () => {
        const result = generateValueAnalysis({ project: { name: '서비스 제품' }, answers: {} });
        expect(valueAnalysisResultSchema.safeParse(result).success).toBe(true);
        expect(result.summary).toContain('서비스 제품');
        expect(JSON.stringify(result)).toContain('고객 니즈 확인 필요');
        expect(JSON.stringify(result)).not.toContain('undefined');
    });

    it('AI 프롬프트에 제품 개요·현재 행·WS-2·문진 답변과 근거 제한을 전달한다', () => {
        const prompt = buildValueAnalysisPrompts(input);
        expect(JSON.parse(prompt.user)).toMatchObject({ productName: input.productName, worksheet3: input.existingRows, worksheet2: input.specFunctions, answers: input.answers });
        expect(prompt.user).toContain('양면 유로 가공');
        expect(prompt.system).toContain('본원활동');
        expect(prompt.system).toContain('지원활동');
        expect(prompt.system).toContain('대금');
        expect(prompt.system).toContain('만들어내지 마세요');
    });

    it('두 분석 중 하나가 빠지거나 분류가 잘못된 AI 응답은 거부한다', () => {
        const result = generateValueAnalysis(input);
        expect(valueAnalysisResultSchema.safeParse({ ...result, valueSystem: [] }).success).toBe(false);
        expect(valueAnalysisResultSchema.safeParse({ ...result, valueChain: undefined }).success).toBe(false);
        expect(valueAnalysisResultSchema.safeParse({ ...result, valueChain: [{ ...result.valueChain[0], category: 'unknown' }] }).success).toBe(false);
    });

    it('AI 엔진이 구조화된 결과를 반환하고 잘못된 응답은 교정 후 기본 엔진으로 전환된다', async () => {
        const expected = generateValueAnalysis(input);
        const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(expected) } }] })));
        vi.stubGlobal('fetch', fetchMock);
        const provider = createOpenAiCompatibleProvider({ id: 'local', label: '테스트', baseUrls: ['http://localhost:11434/v1'], model: 'test', directEndpoint: true });
        expect(await provider.valueAnalysis(input)).toEqual(expected);
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages[1].content).toContain(input.productName);
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"불완전"}' } }] })));
        const result = await runAiTask(p => p.valueAnalysis(input), {
            requested: 'local', resolveProvider: id => id === 'rule' ? ruleProvider : provider,
        });
        expect(result.degraded).toBe(true);
        expect(result.provider).toBe('rule');
        expect(result.result).toEqual(expected);
    });
});
