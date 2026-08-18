import { describe, expect, it } from 'vitest';
import {
    formatBusinessPlanSections,
    isBusinessPlanSectionsEmpty,
    parseBusinessPlanSections,
    readBusinessPlanForSpec,
} from '../lib/business-plan-sections';

describe('formatBusinessPlanSections', () => {
    it('세 구획을 라벨과 함께 이어 붙인다', () => {
        const text = formatBusinessPlanSections({
            customer: '동호회 운영진',
            problem: '회비 집계에 시간이 든다',
            coreFunctions: '자동 집계',
        });

        expect(text).toBe(
            '[고객 정의]\n동호회 운영진\n\n'
            + '[고객 문제 정의]\n회비 집계에 시간이 든다\n\n'
            + '[핵심 기능]\n자동 집계'
        );
    });

    it('값이 있는 구획만 남긴다', () => {
        const text = formatBusinessPlanSections({ customer: '운영진', problem: '', coreFunctions: '' });
        expect(text).toBe('[고객 정의]\n운영진');
    });

    it('전부 비면 빈 문자열이라 라벨만 남지 않는다', () => {
        expect(formatBusinessPlanSections({ customer: '', problem: '', coreFunctions: '' })).toBe('');
    });
});

describe('parseBusinessPlanSections', () => {
    it('조합한 텍스트를 원래 구획으로 되돌린다', () => {
        const sections = { customer: '운영진', problem: '집계 부담', coreFunctions: '자동 집계\n미납 안내' };
        expect(parseBusinessPlanSections(formatBusinessPlanSections(sections))).toEqual(sections);
    });

    it('구획 안의 여러 줄을 보존한다', () => {
        const parsed = parseBusinessPlanSections('[핵심 기능]\n가\n나\n다');
        expect(parsed.coreFunctions).toBe('가\n나\n다');
    });

    it('라벨이 없는 자유 서술은 빈 구획으로 돌려준다', () => {
        const parsed = parseBusinessPlanSections('그냥 적어 둔 설명입니다.');
        expect(isBusinessPlanSectionsEmpty(parsed)).toBe(true);
    });

    it('null 과 빈 문자열을 견딘다', () => {
        expect(isBusinessPlanSectionsEmpty(parseBusinessPlanSections(null))).toBe(true);
        expect(isBusinessPlanSectionsEmpty(parseBusinessPlanSections('   '))).toBe(true);
    });

    it('구획 순서가 뒤바뀌어도 읽는다', () => {
        const parsed = parseBusinessPlanSections('[핵심 기능]\n집계\n\n[고객 정의]\n운영진');
        expect(parsed.coreFunctions).toBe('집계');
        expect(parsed.customer).toBe('운영진');
    });
});

describe('readBusinessPlanForSpec', () => {
    it('구획이 있으면 핵심 기능을 원하는 기능 칸으로 넘긴다', () => {
        const result = readBusinessPlanForSpec('[고객 정의]\n운영진\n\n[핵심 기능]\n자동 집계');
        expect(result.hasSections).toBe(true);
        expect(result.desiredFunctions).toBe('자동 집계');
        expect(result.detailText).toContain('운영진');
    });

    it('자유 서술이면 원문을 세부설명으로만 쓰고 기능 칸은 비운다', () => {
        const result = readBusinessPlanForSpec('자유롭게 적은 설명');
        expect(result.hasSections).toBe(false);
        expect(result.desiredFunctions).toBe('');
        expect(result.detailText).toBe('자유롭게 적은 설명');
    });

    it('값이 없으면 빈 문자열을 돌려준다', () => {
        const result = readBusinessPlanForSpec(null);
        expect(result.detailText).toBe('');
        expect(result.desiredFunctions).toBe('');
    });
});
