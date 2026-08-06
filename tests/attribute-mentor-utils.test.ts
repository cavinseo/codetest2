import { describe, expect, it } from 'vitest';
import {
    buildAppliedRows,
    buildSpecFunctionOptions,
    collectTechnologies,
    type MentorDraftRow,
} from '../lib/attribute-mentor-utils';

const specs = [
    { id: 'core-1', level: 'CORE' as const, name: '회원 관리', order: 0 },
    { id: 'sub-1', level: 'SUB' as const, parentId: 'core-1', name: '명부 통합 관리', order: 1 },
    { id: 'detail-1', level: 'DETAIL' as const, parentId: 'sub-1', name: '회원 명부 자동 동기화', technology: '데이터 통합 계층', order: 2 },
    { id: 'detail-2', level: 'DETAIL' as const, parentId: 'sub-1', name: '중복 회원 병합', technology: '레코드 매칭', order: 3 },
];

const draftRows: MentorDraftRow[] = [
    { id: 'r1', marketSegment: '소규모 동호회', customerName: '운영진', customerNeed: '수기 관리', benefit: '시간 절감' },
    { id: 'r2', marketSegment: '소규모 동호회', customerName: '총무', customerNeed: '수기 관리', benefit: '시간 절감' },
];

describe('WS-2 기능 선택 목록', () => {
    it('세부기능과 세세부기능만 후보로 올린다', () => {
        const options = buildSpecFunctionOptions(specs);

        expect(options.map((option) => option.name)).toEqual([
            '명부 통합 관리',
            '회원 명부 자동 동기화',
            '중복 회원 병합',
        ]);
        expect(options.find((option) => option.name === '회원 명부 자동 동기화')).toMatchObject({
            level: 'DETAIL',
            parentName: '명부 통합 관리',
            technology: '데이터 통합 계층',
        });
    });
});

describe('선택 결과를 표 행으로 변환', () => {
    it('선택한 기능마다 행을 만들고 니즈·혜택은 반복해 넣는다', () => {
        const applied = buildAppliedRows(draftRows, new Set(['r1', 'r2']), {
            r1: ['회원 명부 자동 동기화', '중복 회원 병합'],
            r2: ['회원 명부 자동 동기화'],
        });

        expect(applied).toEqual([
            { marketSegment: '소규모 동호회', customerName: '운영진', customerNeed: '수기 관리', benefit: '시간 절감', attribute: '회원 명부 자동 동기화' },
            { marketSegment: '소규모 동호회', customerName: '운영진', customerNeed: '수기 관리', benefit: '시간 절감', attribute: '중복 회원 병합' },
            { marketSegment: '소규모 동호회', customerName: '총무', customerNeed: '수기 관리', benefit: '시간 절감', attribute: '회원 명부 자동 동기화' },
        ]);
    });

    it('선택하지 않은 행은 제외한다', () => {
        const applied = buildAppliedRows(draftRows, new Set(['r1']), { r1: ['중복 회원 병합'] });

        expect(applied).toHaveLength(1);
        expect(applied[0].customerName).toBe('운영진');
    });

    it('기능을 고르지 않은 행도 속성만 비운 채 남긴다', () => {
        const applied = buildAppliedRows(draftRows, new Set(['r1']), {});

        expect(applied).toEqual([
            { marketSegment: '소규모 동호회', customerName: '운영진', customerNeed: '수기 관리', benefit: '시간 절감', attribute: '' },
        ]);
    });
});

describe('적용 기술 자동 수집', () => {
    it('선택한 기능의 기술을 중복 없이 모은다', () => {
        const technologies = collectTechnologies(specs, {
            r1: ['회원 명부 자동 동기화', '중복 회원 병합'],
            r2: ['회원 명부 자동 동기화'],
        }, new Set(['r1', 'r2']));

        expect(technologies).toEqual(['데이터 통합 계층', '레코드 매칭']);
    });

    it('세부기능을 고르면 하위 세세부기능 기술이 각각 풀려서 담긴다', () => {
        const technologies = collectTechnologies(specs, { r1: ['명부 통합 관리'] }, new Set(['r1']));

        expect(technologies).toEqual(['데이터 통합 계층', '레코드 매칭']);
    });

    it('선택하지 않은 행의 기술은 제외한다', () => {
        const technologies = collectTechnologies(specs, { r2: ['중복 회원 병합'] }, new Set(['r1']));

        expect(technologies).toEqual([]);
    });
});
