// 프로젝트 백업이 모든 복원 가능한 워크시트 데이터를 내보내는지 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUnique = vi.fn();
const requireProjectAccess = vi.fn();

vi.mock('../lib/prisma', () => ({ prisma: { project: { findUnique } } }));
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { GET } = await import('../app/api/projects/[id]/export/route');
const params = { params: Promise.resolve({ id: 'project-1' }) };

beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ user: { userId: 'user-1' }, role: 'OWNER' });
    findUnique.mockResolvedValue({
        name: '백업 원본', description: '설명', detailedDescription: null,
        specFunctions: [], productAttributes: [], attributeFitnesses: [], requirements: [], technicalCharacteristics: [],
        qfdMatrices: [], kanoResponses: [], techCorrelations: [], benchmarks: [], technicalBenchmarks: [],
        techTreeEntries: [{ customerVoice: '요구' }],
        improvementItems: [{ type: 'need', content: '개선' }],
        targetSpecs: [{ specItem: '응답시간' }],
        techRoadmaps: [{ techItem: '엔진' }],
        devPlans: [{ task: '개발' }],
        salesEstimates: [{ amount: 120 }],
        assetItems: [{ type: 'CORE' }],
        fundingPlans: [{ item: '연구개발' }],
        fundingSources: [{ category: '정부자금' }],
        fitnessMatrix: { id: 'fitness-1', projectId: 'project-1', marketsJson: '[]', matrixJson: '{}', managerComment: null, consultantNote: null, updatedAt: new Date('2026-09-18') },
    });
});

it('누락되던 워크시트와 적합도 매트릭스를 백업에 포함한다', async () => {
    const response = await GET(new NextRequest('http://localhost/api/projects/project-1/export'), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(findUnique.mock.calls[0][0].include.devPlans).toBe(true);
    expect(body.version).toBe('1.1-prisma');
    expect(body.techTreeEntries).toEqual([{ customerVoice: '요구' }]);
    expect(body.improvementItems).toEqual([{ type: 'need', content: '개선' }]);
    expect(body.targetSpecs).toEqual([{ specItem: '응답시간' }]);
    expect(body.techRoadmaps).toEqual([{ techItem: '엔진' }]);
    expect(body.devPlans).toEqual([{ task: '개발' }]);
    expect(body.salesEstimates).toEqual([{ amount: 120 }]);
    expect(body.assetItems).toEqual([{ type: 'CORE' }]);
    expect(body.fundingPlans).toEqual([{ item: '연구개발' }]);
    expect(body.fundingSources).toEqual([{ category: '정부자금' }]);
    expect(body.fitnessMatrix).toMatchObject({ marketsJson: '[]', matrixJson: '{}' });
});

it('적합도 매트릭스가 없는 프로젝트도 전체 백업에 null을 기록한다', async () => {
    findUnique.mockResolvedValueOnce({
        name: '빈 프로젝트', description: null, detailedDescription: null,
        specFunctions: [], productAttributes: [], attributeFitnesses: [], requirements: [], technicalCharacteristics: [],
        qfdMatrices: [], kanoResponses: [], techCorrelations: [], benchmarks: [], technicalBenchmarks: [],
        techTreeEntries: [], improvementItems: [], targetSpecs: [], techRoadmaps: [], devPlans: [], salesEstimates: [],
        assetItems: [], fundingPlans: [], fundingSources: [], fitnessMatrix: null,
    });

    const response = await GET(new NextRequest('http://localhost/api/projects/project-1/export'), params);

    expect((await response.json()).fitnessMatrix).toBeNull();
});
