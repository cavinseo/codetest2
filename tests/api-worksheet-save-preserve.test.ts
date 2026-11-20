// 워크시트 저장이 사용자가 건드리지 않은 데이터를 지우지 않고, 지우라는 요청은 실제로
// 지우는지 확인한다(2026-10-25 코드 리뷰 B1·B5).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const countCustomerRequirement = vi.fn();
const findProject = vi.fn();
const findRequirements = vi.fn();
const transaction = vi.fn();
const updateRequirements = vi.fn();
const createRequirement = vi.fn();
const findTxRequirements = vi.fn();
const deleteSpecs = vi.fn();
const createSpec = vi.fn();
const findSpecs = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { count: countCustomerRequirement, findMany: findRequirements },
        project: { findUnique: findProject },
        $transaction: (...args: unknown[]) => transaction(...(args as [])),
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { worksheetRevision } = await import('../lib/worksheet-revision');
const { POST: saveRequirements } = await import('../app/api/projects/[id]/requirements/route');
const { POST: saveSpecs } = await import('../app/api/projects/[id]/spec/route');

const params = Promise.resolve({ id: 'proj_1' });

function postRequest(path: string, body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/projects/proj_1/${path}`, {
        method: 'POST',
        // 전체 교체 저장은 화면이 읽은 개정값을 If-Match 로 보내야 한다(감리 B3).
        headers: { 'Content-Type': 'application/json', 'If-Match': worksheetRevision([]) },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: { userId: 'user_1' }, role: 'OWNER' });
    // 제출 id 가 기존 행을 모두 덮는 정상 편집이라 지워질 기존 행은 없다.
    countCustomerRequirement.mockResolvedValue(0);
    findProject.mockResolvedValue({ id: 'proj_1' });
    // 다른 프로젝트에 같은 id 가 있는지 보는 조회(B13). 기본은 없음.
    findRequirements.mockResolvedValue([]);
    updateRequirements.mockResolvedValue({ count: 1 });
    createRequirement.mockResolvedValue({ count: 1 });
    findTxRequirements.mockImplementation(async ({ where }: { where: { id?: { in: string[] } } }) =>
        where.id?.in ? where.id.in.filter((id) => id === 'req_1').map((id) => ({ id })) : []);
    deleteSpecs.mockResolvedValue({ count: 3 });
    createSpec.mockResolvedValue({ id: 'spec_1' });
    findSpecs.mockResolvedValue([]);
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        customerRequirement: {
            // 지우기 직전 캐스케이드 재확인(감리 B4)이 센다. 지워질 기존 행은 없다.
            count: vi.fn().mockResolvedValue(0),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            // 트랜잭션 안에서는 (1) 순서 동기화용 이전 목록과 (2) 제출 id 중 이 프로젝트에
            // 이미 있는 행을 읽는다. req_1 만 저장돼 있다고 본다.
            findMany: findTxRequirements,
            updateMany: updateRequirements,
            createMany: createRequirement,
        },
        // 요구사항 순서를 따르는 후속 워크시트는 비어 있다고 본다.
        techTreeEntry: { findMany: vi.fn().mockResolvedValue([]) },
        improvementItem: { findMany: vi.fn().mockResolvedValue([]) },
        techRoadmap: { findMany: vi.fn().mockResolvedValue([]) },
        targetSpec: { findMany: vi.fn().mockResolvedValue([]) },
        specFunction: { deleteMany: deleteSpecs, create: createSpec, findMany: findSpecs },
    }));
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('요구사항 저장의 Kano 질문·가중치 보존 (B1)', () => {
    it('Kano 값을 보내지 않은 요구사항 표 저장은 Kano 질문·가중치를 건드리지 않는다', async () => {
        const res = await saveRequirements(postRequest('requirements', {
            requirements: [{ id: 'req_1', category: '사용성', subcategory: '속도', requirement: '빠른 주문', order: 0 }],
        }), { params });

        expect(res.status).toBe(200);
        expect(updateRequirements).toHaveBeenCalledWith({
            where: { id: 'req_1', projectId: 'proj_1' },
            data: { category: '사용성', subcategory: '속도', requirement: '빠른 주문', order: 0 },
        });
    });

    it('Kano 화면이 보낸 질문·가중치는 그대로 저장하고 명시적 null 은 지운다', async () => {
        // 가중치는 분석을 편집할 수 있는 담당 멘토만 바꿀 수 있다(lib/kano-analysis-access).
        requireProjectAccess.mockResolvedValue({ user: { userId: 'mentor_1', role: 'MENTOR' }, role: 'EDITOR' });
        const res = await saveRequirements(postRequest('requirements', {
            requirements: [{
                id: 'req_1', category: '사용성', subcategory: null, requirement: '빠른 주문', order: 0,
                kanoPositiveQ: '빠르다면?', kanoNegativeQ: null, kanoWeight: 3,
            }],
        }), { params });

        expect(res.status).toBe(200);
        expect(updateRequirements).toHaveBeenCalledWith({
            where: { id: 'req_1', projectId: 'proj_1' },
            data: {
                category: '사용성', subcategory: null, requirement: '빠른 주문', order: 0,
                kanoPositiveQ: '빠르다면?', kanoNegativeQ: null, kanoWeight: 3,
            },
        });
    });

    it('새 요구사항도 Kano 값이 없으면 그 칸을 비워 둔 채 만든다', async () => {
        updateRequirements.mockResolvedValue({ count: 0 });
        await saveRequirements(postRequest('requirements', {
            requirements: [{ id: 'req_new', category: '안정성', requirement: '안전한 보관', order: 1 }],
        }), { params });

        expect(createRequirement).toHaveBeenCalledWith({
            // 저장 순서는 1·2차 분류로 다시 매기므로 행 하나는 0번이 된다.
            data: [{ id: 'req_new', projectId: 'proj_1', category: '안정성', subcategory: null, requirement: '안전한 보관', order: 0 }],
        });
    });
});

describe('스펙 전체 교체 저장 (B5)', () => {
    it('빈 목록은 그 프로젝트의 스펙을 실제로 모두 지운다', async () => {
        // 저장은 불러올 때 받은 개정값을 If-Match 로 보내야 한다(동시 편집 덮어쓰기 방지).
        const request = postRequest('spec', { specFunctions: [] });
        request.headers.set('If-Match', worksheetRevision([]));
        const res = await saveSpecs(request, { params });

        expect(res.status).toBe(200);
        expect(deleteSpecs).toHaveBeenCalledWith({ where: { projectId: 'proj_1' } });
        expect(createSpec).not.toHaveBeenCalled();
        expect(await res.json()).toEqual({ specFunctions: [], message: '스펙이 저장되었습니다', revision: worksheetRevision([]) });
    });

    it.each([
        ['specFunctions 가 빠진 요청', {}],
        ['배열이 아닌 specFunctions', { specFunctions: {} }],
    ])('%s 은 아무것도 지우지 않고 400 으로 거절한다', async (_case, body) => {
        const res = await saveSpecs(postRequest('spec', body), { params });

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
        expect(deleteSpecs).not.toHaveBeenCalled();
    });
});

describe('깨진 JSON 본문 (B25)', () => {
    it('요구사항 저장은 공통 오류 응답에서 400 으로 거절한다', async () => {
        const res = await saveRequirements(new NextRequest('http://localhost/api/projects/proj_1/requirements', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"requirements":',
        }), { params });

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: '요청 본문이 올바른 JSON 형식이 아닙니다.' });
        expect(transaction).not.toHaveBeenCalled();
    });

    it('스펙 저장도 400 으로 거절한다', async () => {
        const res = await saveSpecs(new NextRequest('http://localhost/api/projects/proj_1/spec', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not-json',
        }), { params });

        expect(res.status).toBe(400);
        expect(deleteSpecs).not.toHaveBeenCalled();
    });
});
