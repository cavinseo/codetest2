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

const { POST: saveRequirements } = await import('../app/api/projects/[id]/requirements/route');
const { POST: saveSpecs } = await import('../app/api/projects/[id]/spec/route');

const params = Promise.resolve({ id: 'proj_1' });

function postRequest(path: string, body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/projects/proj_1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    createRequirement.mockResolvedValue({});
    deleteSpecs.mockResolvedValue({ count: 3 });
    createSpec.mockResolvedValue({ id: 'spec_1' });
    findSpecs.mockResolvedValue([]);
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        customerRequirement: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            updateMany: updateRequirements,
            create: createRequirement,
        },
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
            data: { id: 'req_new', projectId: 'proj_1', category: '안정성', subcategory: null, requirement: '안전한 보관', order: 1 },
        });
    });
});

describe('스펙 전체 교체 저장 (B5)', () => {
    it('빈 목록은 그 프로젝트의 스펙을 실제로 모두 지운다', async () => {
        const res = await saveSpecs(postRequest('spec', { specFunctions: [] }), { params });

        expect(res.status).toBe(200);
        expect(deleteSpecs).toHaveBeenCalledWith({ where: { projectId: 'proj_1' } });
        expect(createSpec).not.toHaveBeenCalled();
        expect(await res.json()).toEqual({ specFunctions: [], message: '스펙이 저장되었습니다' });
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
