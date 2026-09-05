import { describe, expect, it } from 'vitest';
import { specDraftTreeSchema, type SpecDraftInput } from '../lib/ai/types';
import { buildAttributeDraftPrompts, buildSpecDraftPrompts } from '../lib/ai/prompts';
import {
    composeSpecDraftFromCores,
    generateSpecAiDraft,
    generateSpecDraftCores,
    type Core,
} from '../lib/spec-ai-agent';

const context: SpecDraftInput = {
    project: {
        name: '동호회 운영 관리 솔루션',
        description: '회원·회비·일정을 한 곳에서 관리하는 서비스',
        detailedDescription: '[핵심 기능]\n회원 명부 통합 관리\n회비 자동 집계',
    },
    additionalDescription: '소규모 비영리 동호회 운영진이 매달 쓰는 도구',
    structuredInput: { currentFunctions: '회원 관리, 회비 집계' },
};

const tree: Core[] = [
    {
        name: '회원 관리 기술',
        subs: [
            { name: '명부 처리 기술', details: [{ name: '명부 통합', technology: '데이터 정규화' }] },
            { name: '검증 기술', details: [{ name: '중복 검출', technology: '유사도 매칭' }] },
        ],
    },
];

describe('specDraftTreeSchema', () => {
    it('정상 나무를 통과시킨다', () => {
        expect(specDraftTreeSchema.safeParse({ cores: tree }).success).toBe(true);
    });

    it('적용기술을 비워도 기본값으로 채운다', () => {
        const parsed = specDraftTreeSchema.parse({
            cores: [{ name: '핵심', subs: [{ name: '세부', details: [{ name: '기능' }] }] }],
        });
        expect(parsed.cores[0].subs[0].details[0].technology).toBe('');
    });

    it('이름이 비면 거부한다', () => {
        const result = specDraftTreeSchema.safeParse({
            cores: [{ name: '', subs: [{ name: '세부', details: [{ name: '기능' }] }] }],
        });
        expect(result.success).toBe(false);
    });

    it('핵심기술이 없으면 거부한다', () => {
        expect(specDraftTreeSchema.safeParse({ cores: [] }).success).toBe(false);
    });

    it('상한을 넘는 핵심기술 수를 거부한다', () => {
        const many = Array.from({ length: 9 }, (_, index) => ({
            name: `핵심 ${index}`,
            subs: [{ name: '세부', details: [{ name: '기능' }] }],
        }));
        expect(specDraftTreeSchema.safeParse({ cores: many }).success).toBe(false);
    });

    it('지나치게 긴 이름을 거부한다', () => {
        const result = specDraftTreeSchema.safeParse({
            cores: [{ name: '가'.repeat(81), subs: [{ name: '세부', details: [{ name: '기능' }] }] }],
        });
        expect(result.success).toBe(false);
    });
});

describe('composeSpecDraftFromCores', () => {
    it('나무를 평탄화해 계층과 순서를 부여한다', () => {
        const result = composeSpecDraftFromCores(tree, context);
        const levels = result.specFunctions.map((spec) => spec.level);

        expect(levels[0]).toBe('CORE');
        expect(levels).toContain('SUB');
        expect(levels).toContain('DETAIL');
        // order 는 0부터 빈틈없이 증가해야 한다.
        expect(result.specFunctions.map((spec) => spec.order)).toEqual(
            result.specFunctions.map((_, index) => index)
        );
    });

    it('하위 항목이 상위 항목을 부모로 가리킨다', () => {
        const result = composeSpecDraftFromCores(tree, context);
        const byId = new Map(result.specFunctions.map((spec) => [spec.id, spec]));

        for (const spec of result.specFunctions) {
            if (spec.level === 'CORE') continue;
            expect(spec.parentId).toBeTruthy();
            expect(byId.get(spec.parentId!)).toBeDefined();
        }
    });

    it('검증·추천·요약을 함께 돌려준다', () => {
        const result = composeSpecDraftFromCores(tree, context);
        expect(Array.isArray(result.issues)).toBe(true);
        expect(Array.isArray(result.recommendations)).toBe(true);
        expect(result.contextSummary).toBeTruthy();
    });

    it('적용기술이 빈 구현기능은 경고로 잡는다', () => {
        const result = composeSpecDraftFromCores(
            [{ name: '핵심', subs: [{ name: '세부', details: [{ name: '기능', technology: '' }] }] }],
            context
        );
        expect(result.issues.some((issue) => issue.severity === 'warning')).toBe(true);
    });
});

describe('generateSpecDraftCores', () => {
    it('규칙 기반으로도 나무를 만든다', () => {
        const cores = generateSpecDraftCores(context);
        expect(cores.length).toBeGreaterThan(0);
        expect(cores[0].subs.length).toBeGreaterThan(0);
        expect(cores[0].subs[0].details.length).toBeGreaterThan(0);
    });

    it('만든 나무가 LLM 용 스키마도 통과한다', () => {
        // 규칙 기반과 LLM 이 같은 계약을 쓴다는 것을 보장한다.
        expect(specDraftTreeSchema.safeParse({ cores: generateSpecDraftCores(context) }).success).toBe(true);
    });

    it('draft 모드 기존 결과와 같은 구조를 낸다', () => {
        const viaCores = composeSpecDraftFromCores(generateSpecDraftCores(context), context);
        const viaLegacy = generateSpecAiDraft('draft', context);
        expect(viaCores.specFunctions).toEqual(viaLegacy.specFunctions);
    });
});

describe('buildSpecDraftPrompts', () => {
    it('JSON 형식 지시와 제품 문맥을 함께 넣는다', () => {
        const prompts = buildSpecDraftPrompts(context);
        expect(prompts.system).toContain('"cores"');
        expect(prompts.system).toContain('FAST');
        expect(prompts.user).toContain('동호회 운영 관리 솔루션');
        expect(prompts.user).toContain('회원 관리, 회비 집계');
    });

    it('참고 문맥이 없으면 "없음" 으로 채운다', () => {
        const prompts = buildSpecDraftPrompts({ project: { name: '이름만 있는 제품' } });
        expect(prompts.user).toContain('없음');
    });

    it('긴 문맥을 잘라 프롬프트가 무한정 커지지 않게 한다', () => {
        const prompts = buildSpecDraftPrompts({
            project: { name: '제품', detailedDescription: '가'.repeat(5000) },
        });
        expect(prompts.user).toContain('...');
        expect(prompts.user.length).toBeLessThan(4000);
    });

    it('고객 요구사항과 보유 기술을 요약해 넣는다', () => {
        const prompts = buildSpecDraftPrompts({
            project: { name: '제품' },
            customerRequirements: [{ requirement: '미납자 자동 안내' }],
            qfdTechnicals: [{ name: '알림 발송 엔진' }],
        } as SpecDraftInput);

        expect(prompts.user).toContain('미납자 자동 안내');
        expect(prompts.user).toContain('알림 발송 엔진');
    });
});

describe('buildAttributeDraftPrompts', () => {
    it('제품 문맥과 문진 답변을 JSON 형식 지시와 함께 넣는다', () => {
        const prompts = buildAttributeDraftPrompts({
            project: { name: '동호회 운영 관리 솔루션', description: '회원·회비를 관리한다' },
            answers: {
                segmentationBasis: '조직 규모',
                marketSegments: '소규모 동호회',
                customerNames: '운영진',
                customerProblems: '회비 집계에 손이 많이 간다',
                expectedBenefits: '집계 시간 단축',
            },
        });

        expect(prompts.system).toContain('"rows"');
        expect(prompts.system).toContain('WS-3');
        expect(prompts.user).toContain('동호회 운영 관리 솔루션');
        expect(prompts.user).toContain('조직 규모');
        expect(prompts.user).toContain('회비 집계에 손이 많이 간다');
        expect(prompts.user).toContain('집계 시간 단축');
    });

    it('답변이 비어 있어도 항목 이름은 남겨 프롬프트 형태를 유지한다', () => {
        // 값이 없을 때 undefined 가 그대로 찍히면 모델이 그것을 내용으로 읽는다.
        const prompts = buildAttributeDraftPrompts({
            project: { name: '이름만 있는 제품' },
            answers: {},
        });

        expect(prompts.user).toContain('제품명: 이름만 있는 제품');
        expect(prompts.user).toContain('세분화 기준:');
        expect(prompts.user).not.toContain('undefined');
        expect(prompts.user).not.toContain('null');
    });
});
