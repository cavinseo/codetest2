// 분석 입력 제한과 WS-12 항목 변경 시 기존 설명 보존을 검증한다.
import { describe, expect, it } from 'vitest';
import { appendTargetSpecItems, isAnalysisWorksheetId, saveWorksheetAnalysisSchema, worksheetAnalysisSchema } from '@/lib/mentor-worksheet-analysis';

describe('멘토 워크시트 분석', () => {
    it('요청한 8개 워크시트만 지원하며 임의 키를 받지 않는다', () => {
        const ids = ['spec', 'attributes', 'fitness', 'target-spec', 'tech-roadmap', 'assets', 'funding-plan', 'funding-source'];
        expect(ids.every(isAnalysisWorksheetId)).toBe(true);
        expect(isAnalysisWorksheetId('overview')).toBe(false);
        expect(isAnalysisWorksheetId('constructor')).toBe(false);
        expect(worksheetAnalysisSchema.safeParse({ overview: { analysis: '허용 안 함' } }).success).toBe(false);
    });
    it('워크시트에 맞는 입력만 받고 빈 값은 명시적인 삭제로 보존한다', () => {
        expect(saveWorksheetAnalysisSchema.safeParse({ version: 0, worksheetId: 'assets', analysis: { analysis: '형식 오류' } }).success).toBe(false);
        expect(saveWorksheetAnalysisSchema.parse({ version: 2, worksheetId: 'assets', analysis: { core: '', complementary: '' } }).analysis).toEqual({ core: '', complementary: '' });
        expect(saveWorksheetAnalysisSchema.safeParse({ version: 0, worksheetId: 'spec', analysis: { analysis: 'a'.repeat(20_001) } }).success).toBe(false);
    });
    it('재발급된 행 ID·순서와 무관하게 설명을 유지하고 새 항목만 추가한다', () => {
        const original = [{ label: '핵심 / 세부 / 특성', explanation: '기존 분석' }, { label: '제거된 원본 항목', explanation: '삭제되면 안 되는 분석' }];
        const before = structuredClone(original);
        const result = appendTargetSpecItems(original, [
            { category: '새 핵심', subCategory: '새 세부', specItem: '새 특성' },
            { category: '핵심', subCategory: '세부', specItem: '특성' },
            { category: '새 핵심', subCategory: '새 세부', specItem: '새 특성' },
        ]);
        expect(original).toEqual(before);
        expect(result).toEqual([...before, { label: '새 핵심 / 새 세부 / 새 특성', explanation: '' }]);
    });
    it('새 원본이 비어 있어도 설명을 지우지 않고 500개를 넘는 저장은 거절한다', () => {
        const saved = [{ label: '기존', explanation: '유지' }];
        expect(appendTargetSpecItems(saved, [{ category: null }])).toEqual(saved);
        expect(saveWorksheetAnalysisSchema.safeParse({ version: 1, worksheetId: 'target-spec', analysis: { items: Array(501).fill(saved[0]) } }).success).toBe(false);
    });
});
