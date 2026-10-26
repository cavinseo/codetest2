import { describe, expect, it } from 'vitest';
import { buildFlatSpecRowsFromFunctions, groupSpecRows, renameSpecGroup } from '../lib/spec-table-utils';

describe('spec table row mapping', () => {
    it('keeps AS-IS applied technology visible when detail records have technology', () => {
        const rows = buildFlatSpecRowsFromFunctions([
            { id: 'core-1', level: 'CORE', name: '커미션 거래 중계', order: 0 },
            { id: 'sub-1', level: 'SUB', parentId: 'core-1', name: '의뢰 등록·매칭', order: 1 },
            {
                id: 'detail-1',
                level: 'DETAIL',
                parentId: 'sub-1',
                name: '장르·스타일별 의뢰 게시판 구성',
                technology: '카테고리 기반 게시판',
                order: 2,
            },
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            core: '커미션 거래 중계',
            sub: '의뢰 등록·매칭',
            detail: '장르·스타일별 의뢰 게시판 구성',
            technology: '카테고리 기반 게시판',
        });
    });

    it('falls back to the detail text so legacy rows do not render an empty applied technology column', () => {
        const rows = buildFlatSpecRowsFromFunctions([
            { id: 'core-1', level: 'CORE', name: '커미션 거래 중계', order: 0 },
            { id: 'sub-1', level: 'SUB', parentId: 'core-1', name: '의뢰 등록·매칭', order: 1 },
            {
                id: 'detail-1',
                level: 'DETAIL',
                parentId: 'sub-1',
                name: 'AI 기반 작가-의뢰 자동 매칭 추천',
                technology: null,
                order: 2,
            },
        ]);

        expect(rows[0].technology).toBe('AI 기반 작가-의뢰 자동 매칭 추천');
    });

    it('shows technology stored on a sub function when no detail exists', () => {
        const rows = buildFlatSpecRowsFromFunctions([
            { id: 'core-1', level: 'CORE', name: '커미션 거래 중계', order: 0 },
            {
                id: 'sub-1',
                level: 'SUB',
                parentId: 'core-1',
                name: '의뢰 등록·매칭',
                technology: '매칭 로직/필터링',
                order: 1,
            },
        ]);

        expect(rows[0]).toMatchObject({
            detail: '',
            technology: '매칭 로직/필터링',
        });
    });
});

describe('groupSpecRows / renameSpecGroup (L3 — 스펙표와 FAST 작성 지원 창이 함께 쓴다)', () => {
    const row = (id: string, core: string, sub: string, detail = '') => ({ id, core, sub, detail, technology: '' });
    const rows = [
        row('a', '센싱', '온도', '열전대'),
        row('b', '센싱', '온도', '서미스터'),
        row('c', '센싱', '습도'),
        row('d', '제어', '온도'),
        row('e', '', '온도'),
        row('f', '', '온도'),
    ];

    it('이어지는 같은 핵심·세부를 첫 행의 rowSpan 으로 합친다', () => {
        expect(groupSpecRows(rows).map((item) => [item.id, item.coreRowSpan, item.subRowSpan])).toEqual([
            ['a', 3, 2],
            ['b', 0, 0],
            ['c', 0, 1],
            // 핵심이 바뀌면 세부 이름이 같아도 새 묶음이다.
            ['d', 1, 1],
            // 핵심이 빈 행은 묶지 않는다.
            ['e', 1, 1],
            ['f', 1, 1],
        ]);
    });

    it('앞뒤 공백은 같은 이름으로 본다', () => {
        expect(groupSpecRows([row('a', '센싱 ', '온도'), row('b', ' 센싱', ' 온도 ')]).map((item) => [item.coreRowSpan, item.subRowSpan]))
            .toEqual([[2, 2], [0, 0]]);
    });

    it('핵심 칸을 고치면 이어지는 같은 핵심 묶음 전체가 바뀐다', () => {
        expect(renameSpecGroup(rows, 1, 'core', '감지').map((item) => item.core)).toEqual(['감지', '감지', '감지', '제어', '', '']);
    });

    it('세부 칸을 고치면 같은 핵심 안의 같은 세부 묶음만 바뀐다', () => {
        expect(renameSpecGroup(rows, 0, 'sub', '열').map((item) => item.sub)).toEqual(['열', '열', '습도', '온도', '온도', '온도']);
        expect(renameSpecGroup(rows, 3, 'sub', '열').map((item) => item.sub)).toEqual(['온도', '온도', '습도', '열', '온도', '온도']);
    });

    it('빈 칸을 채우면 그 행만 바뀌고, 원래 배열은 그대로다', () => {
        const blank = [row('a', '', ''), row('b', '', '')];

        expect(renameSpecGroup(blank, 1, 'core', '새 핵심').map((item) => item.core)).toEqual(['', '새 핵심']);
        expect(renameSpecGroup(blank, 0, 'sub', '새 세부').map((item) => item.sub)).toEqual(['새 세부', '']);
        expect(blank.map((item) => item.core)).toEqual(['', '']);
    });
});
