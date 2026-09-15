// QFD 분석이 기존 공백 세부기능을 삭제하지 않고 결과와 개수에서 제외하는지 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ requirements: vi.fn(), technicals: vi.fn(), relationships: vi.fn(), responses: vi.fn(), benchmarks: vi.fn() }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: vi.fn(async () => ({ role: 'OWNER' })) }));
vi.mock('../lib/prisma', () => ({ prisma: {
    customerRequirement: { findMany: m.requirements }, technicalCharacteristic: { findMany: m.technicals },
    qFDMatrix: { findMany: m.relationships }, kanoResponse: { findMany: m.responses }, benchmark: { findMany: m.benchmarks },
} }));
import { GET } from '../app/api/projects/[id]/qfd/analysis/route';

beforeEach(() => {
    vi.resetAllMocks();
    m.requirements.mockResolvedValue([{ id: 'r1', category: '품질', requirement: '안정성', kanoWeight: 2 }]);
    m.technicals.mockResolvedValue([{ id: 'blank', name: '\t ' }, { id: 'valid', name: '백업' }]);
    m.relationships.mockResolvedValue([
        { requirementId: 'r1', technicalCharId: 'blank', strength: 'STRONG' },
        { requirementId: 'r1', technicalCharId: 'valid', strength: 'WEAK' },
    ]);
    m.responses.mockResolvedValue([]);
    m.benchmarks.mockResolvedValue([]);
});

it('공백 관계를 순위에서 빼고 실제 표시되는 세부기능 수를 응답한다', async () => {
    const response = await GET(new NextRequest('http://localhost/api/projects/p/qfd/analysis'), { params: Promise.resolve({ id: 'p' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totalTechnicals).toBe(1);
    expect(body.technicals).toEqual([expect.objectContaining({ id: 'valid', rank: 1, totalScore: 2 })]);
    expect(body.totals.technicalScore).toBe(2);
});
