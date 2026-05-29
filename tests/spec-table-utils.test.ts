import { describe, expect, it } from 'vitest';
import { buildFlatSpecRowsFromFunctions } from '../lib/spec-table-utils';

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
