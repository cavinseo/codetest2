// QFD 관계·상관관계 라우트가 남의 프로젝트 id 를 받아들이지 않는지 확인한다.
// 막지 않으면 A 프로젝트에 B 의 행·열을 참조하는 행이 생기고, B 가 그 요구사항을
// 지우면 Cascade 로 A 의 QFD 행이 말없이 사라진다. 없는 id 는 FK 위반 500,
// 있는 id 는 200 이라 특정 id 의 존재를 확인하는 오라클로도 쓰인다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const upsertMatrix = vi.fn();
const findFirstRequirement = vi.fn();
const findFirstTech = vi.fn();
const countTech = vi.fn();
const upsertCorrelation = vi.fn();
const deleteManyCorrelation = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        qFDMatrix: { upsert: upsertMatrix },
        customerRequirement: { findFirst: findFirstRequirement },
        technicalCharacteristic: { findFirst: findFirstTech, count: countTech },
        techCorrelation: { upsert: upsertCorrelation, deleteMany: deleteManyCorrelation },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST: postRelationship } = await import('../app/api/projects/[id]/qfd/relationships/route');
const { POST: postCorrelation } = await import('../app/api/projects/[id]/qfd/correlations/route');

const PROJECT = 'proj_1';
const params = { params: Promise.resolve({ id: PROJECT }) };

function post(path: string, body: unknown) {
    return new NextRequest(`http://localhost/api/projects/${PROJECT}/qfd/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'owner@x.com', name: '소유자' },
        role: 'OWNER',
    });
    upsertMatrix.mockResolvedValue({});
    upsertCorrelation.mockResolvedValue({});
    deleteManyCorrelation.mockResolvedValue({ count: 0 });
});

describe('관계 강도 저장의 소속 확인', () => {
    it('두 id 가 모두 이 프로젝트 것이면 저장한다', async () => {
        findFirstRequirement.mockResolvedValue({ id: 'req_1' });
        findFirstTech.mockResolvedValue({ id: 'tech_1' });

        const response = await postRelationship(
            post('relationships', { requirementId: 'req_1', technicalCharId: 'tech_1', strength: 'STRONG' }),
            params
        );

        expect(response.status).toBe(200);
        expect(upsertMatrix).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['요구사항', null, { id: 'tech_1' }],
        ['기술특성', { id: 'req_1' }, null],
        ['둘 다', null, null],
    ])('%s 가 남의 프로젝트 것이면 404 로 막고 아무것도 쓰지 않는다', async (_label, requirement, technical) => {
        findFirstRequirement.mockResolvedValue(requirement);
        findFirstTech.mockResolvedValue(technical);

        const response = await postRelationship(
            post('relationships', { requirementId: 'req_x', technicalCharId: 'tech_x', strength: 'STRONG' }),
            params
        );

        expect(response.status).toBe(404);
        expect(upsertMatrix).not.toHaveBeenCalled();
    });

    it('소속 확인은 projectId 로 좁혀 조회한다', async () => {
        findFirstRequirement.mockResolvedValue({ id: 'req_1' });
        findFirstTech.mockResolvedValue({ id: 'tech_1' });

        await postRelationship(
            post('relationships', { requirementId: 'req_1', technicalCharId: 'tech_1', strength: 'WEAK' }),
            params
        );

        expect(findFirstRequirement).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'req_1', projectId: PROJECT } })
        );
        expect(findFirstTech).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'tech_1', projectId: PROJECT } })
        );
    });
});

describe('상관관계 저장의 소속 확인', () => {
    it('두 기술특성이 모두 이 프로젝트 것이면 저장한다', async () => {
        countTech.mockResolvedValue(2);

        const response = await postCorrelation(
            post('correlations', { techId1: 'tech_a', techId2: 'tech_b', correlation: 'POSITIVE' }),
            params
        );

        expect(response.status).toBe(200);
        expect(upsertCorrelation).toHaveBeenCalledTimes(1);
    });

    it('하나라도 남의 프로젝트 것이면 404 로 막는다', async () => {
        countTech.mockResolvedValue(1);

        const response = await postCorrelation(
            post('correlations', { techId1: 'tech_a', techId2: 'tech_x', correlation: 'POSITIVE' }),
            params
        );

        expect(response.status).toBe(404);
        expect(upsertCorrelation).not.toHaveBeenCalled();
    });

    // NONE 은 삭제 경로다. 남의 id 로 부르면 지워지는 것은 없지만 200 이 돌아와
    // 존재 확인 오라클이 되므로 같이 막는다.
    it('삭제(NONE) 경로도 남의 id 면 404 로 막는다', async () => {
        countTech.mockResolvedValue(1);

        const response = await postCorrelation(
            post('correlations', { techId1: 'tech_a', techId2: 'tech_x', correlation: 'NONE' }),
            params
        );

        expect(response.status).toBe(404);
        expect(deleteManyCorrelation).not.toHaveBeenCalled();
    });
});
