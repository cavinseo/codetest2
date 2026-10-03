// 저장된 WS-4 적합도 행렬이 조회 응답을 거쳐 결과보고서 입력까지 전달되는지 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { buildWorksheetData } from '../lib/final-report-inputs';

const findUnique = vi.hoisted(() => vi.fn());
vi.mock('../lib/prisma', () => ({ prisma: { project: { findUnique } } }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: async () => ({ role: 'VIEWER' }) }));
const { GET } = await import('../app/api/projects/[id]/export/route');

beforeEach(() => vi.clearAllMocks());

it.each([null, { marketsJson: '[{"id":"market","name":"제조시장","subSegments":[{"id":"customer","name":"고객"}]}]', matrixJson: '{"attribute":{"market":{"customer":"H"}}}' }])('WS-4 저장 여부와 평가 데이터를 원본 그대로 전달한다 (%j)', async fitnessMatrix => {
    findUnique.mockResolvedValue({ id: 'project', name: '프로젝트', fitnessMatrix });
    const response = await GET(new NextRequest('http://localhost/api/projects/project/export'), { params: Promise.resolve({ id: 'project' }) });
    const exported = await response.json();
    expect(response.status).toBe(200);
    expect(exported.fitnessMatrix).toEqual(fitnessMatrix);
    const worksheet = buildWorksheetData({ exportData: exported, sales: {}, kanoAnalysis: {}, qfdAnalysis: {}, improvements: {}, techTree: {}, targetSpec: {}, techRoadmap: {}, assets: {}, funding: {} });
    expect(worksheet.fitnessMatrix).toEqual(fitnessMatrix);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ fitnessMatrix: true }) }));
});
