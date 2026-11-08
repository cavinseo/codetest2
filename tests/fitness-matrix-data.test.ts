// WS-4 저장 형식 검사(저장 API)와 깨진 저장값을 견디는 읽기(엑셀·최종 보고서)를 검증한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isValidFitnessMatrixJson, readFitnessMatrixData } from '../lib/fitness-matrix-data';
import { buildFitnessReportTables } from '../lib/final-report-worksheet-tables';
import type { FinalReportWorksheetData } from '../lib/final-report-document';

const upsert = vi.fn();
vi.mock('../lib/prisma', () => ({ prisma: { fitnessMatrix: { upsert } } }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: vi.fn(async () => ({ user: { userId: 'u' }, role: 'EDITOR' })) }));
const { POST } = await import('../app/api/projects/[id]/fitness-matrix/route');

const markets = '[{"id":"market","name":"제조","subSegments":[{"id":"customer","name":"가공업체"}]}]';
const matrix = '{"attr":{"market":{"customer":"H"}}}';
const params = { params: Promise.resolve({ id: 'project' }) };
const save = (body: unknown) => POST(new NextRequest('http://localhost/api/projects/project/fitness-matrix', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), params);

beforeEach(() => { upsert.mockResolvedValue({}); });
afterEach(() => vi.clearAllMocks());

it('올바른 세분시장·행렬만 저장 형식으로 인정한다', () => {
    expect(isValidFitnessMatrixJson(markets, matrix)).toBe(true);
    expect(isValidFitnessMatrixJson('[]', '{}')).toBe(true);
    expect(isValidFitnessMatrixJson('{broken', matrix)).toBe(false);
    expect(isValidFitnessMatrixJson('[{"id":"market","name":"제조"}]', matrix)).toBe(false);
    expect(isValidFitnessMatrixJson(markets, '{"attr":{"market":{"customer":1}}}')).toBe(false);
    expect(isValidFitnessMatrixJson(markets, '[]')).toBe(false);
    expect(isValidFitnessMatrixJson(undefined, matrix)).toBe(false);
    // 문자열이 아닌 값은 String() 으로 바뀌면 JSON 처럼 보여도 받지 않는다(['[]'] → '[]').
    expect(isValidFitnessMatrixJson(['[]'], '{}')).toBe(false);
});

it('저장 API 는 깨진 형식을 400 으로 거르고 올바른 값은 그대로 저장한다', async () => {
    expect((await save({ marketsJson: '{broken', matrixJson: matrix })).status).toBe(400);
    expect((await save({ marketsJson: markets, matrixJson: matrix, managerComment: 3 })).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();

    expect((await save({ marketsJson: markets, matrixJson: matrix, managerComment: '의견', consultantNote: null })).status).toBe(200);
    expect(upsert.mock.calls[0][0].update).toEqual({ marketsJson: markets, matrixJson: matrix, managerComment: '의견', consultantNote: null });
});

it('깨진 저장값은 던지지 않고 읽을 수 있는 부분만 남긴다', () => {
    expect(readFitnessMatrixData(null)).toEqual({ markets: [], matrix: {} });
    expect(readFitnessMatrixData({ marketsJson: '{broken', matrixJson: '{broken' })).toEqual({ markets: [], matrix: {} });
    expect(readFitnessMatrixData({
        marketsJson: '[{"id":"market","name":"제조"},{"id":1},{"id":"no-name"},{"name":"no-id"},null,3,{"id":"m2","name":"유통","subSegments":[{"id":"c","name":"도매"},{"bad":true}]}]',
        matrixJson: matrix,
    })).toEqual({
        markets: [{ id: 'market', name: '제조', subSegments: [] }, { id: 'm2', name: '유통', subSegments: [{ id: 'c', name: '도매' }] }],
        matrix: { attr: { market: { customer: 'H' } } },
    });
});

it('최종 보고서 WS-4 표도 깨진 저장값에서 실패하지 않는다', () => {
    const data = {
        fitnessMatrix: { marketsJson: '[{"id":"market","name":"제조"}]', matrixJson: '{broken' },
        productAttributes: [{ id: 'attr', attribute: '정밀도' }],
    } as unknown as FinalReportWorksheetData;
    expect(() => buildFitnessReportTables(data)).not.toThrow();
});
