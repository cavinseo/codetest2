// WS-9 기술특성 조회 라우트가 WS-10 세부스펙에서 빠진 것만 자동으로 채우는지 검사한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findManyTech = vi.fn();
const readProject = vi.fn();
const updateProject = vi.fn();
const lockProject = vi.fn();
const createManyTech = vi.fn();
const findManyTechTree = vi.fn();
const updateTech = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        $transaction: async (fn: (tx: unknown) => unknown) => fn({
            $queryRaw: lockProject, project: { findUniqueOrThrow: readProject, update: updateProject },
            technicalCharacteristic: { findMany: findManyTech, createMany: createManyTech, update: updateTech },
            techTreeEntry: { findMany: findManyTechTree },
        }),
        technicalCharacteristic: {
            findMany: findManyTech,
            createMany: createManyTech,
        },
        techTreeEntry: {
            findMany: findManyTechTree,
        },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
    isProjectWriteRole: (role: string) => ['OWNER', 'EDITOR', 'ADMIN'].includes(role),
}));

const { GET } = await import('../app/api/projects/[id]/qfd/technical/route');

const USER = { userId: 'user_1', email: 'owner@x.com', name: '소유자' };
const PROJECT = 'proj_1';

function call() {
    const request = new NextRequest(`http://localhost/api/projects/${PROJECT}/qfd/technical`);
    return GET(request, { params: Promise.resolve({ id: PROJECT }) });
}

beforeEach(() => {
    vi.resetAllMocks();
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    createManyTech.mockResolvedValue({ count: 0 });
    readProject.mockResolvedValue({ qfdTechnicalInitialized: false });
    updateProject.mockResolvedValue({});
    lockProject.mockResolvedValue([]);
    findManyTechTree.mockResolvedValue([]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/projects/[id]/qfd/technical', () => {
    it('WS-10 에만 있는 세부스펙을 새 기술특성으로 만든다', async () => {
        findManyTech.mockResolvedValue([{ id: 'tech_1', name: '센서', groupIndex: 0, columnOrder: 0 }]);
        findManyTechTree.mockResolvedValue([
            { subSpec: '센서' },
            { subSpec: '배터리' },
            { subSpec: '' },
            { subSpec: null },
        ]);

        const res = await call();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(createManyTech).toHaveBeenCalledWith({
            data: [{ id: expect.any(String), projectId: PROJECT, name: '배터리', groupIndex: 1, columnOrder: 0, unit: null, targetValue: null }],
        });
        expect(body.technicalCharacteristics).toEqual([
            { id: 'tech_1', name: '센서', groupIndex: 0, columnOrder: 0 },
            expect.objectContaining({ id: expect.any(String), name: '배터리', groupIndex: 1 }),
        ]);
    });

    it('빠진 세부스펙이 없으면 새로 만들지 않는다', async () => {
        findManyTech.mockResolvedValue([{ id: 'tech_1', name: '센서', groupIndex: 0, columnOrder: 0 }]);
        findManyTechTree.mockResolvedValue([{ subSpec: '센서' }]);

        const res = await call();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(createManyTech).not.toHaveBeenCalled();
        expect(findManyTech).toHaveBeenCalledTimes(1);
        expect(body.technicalCharacteristics).toEqual([{ id: 'tech_1', name: '센서', groupIndex: 0, columnOrder: 0 }]);
    });

    it('WS-10 항목이 하나도 없으면 새로 만들지 않는다', async () => {
        findManyTech.mockResolvedValue([]);
        findManyTechTree.mockResolvedValue([]);

        const res = await call();

        expect(res.status).toBe(200);
        expect(createManyTech).not.toHaveBeenCalled();
    });

    it('같은 이름이 중복으로 채워지지 않는다', async () => {
        findManyTech.mockResolvedValue([{ id: 'tech_1', name: '센서', groupIndex: 0, columnOrder: 0 }]);
        findManyTechTree.mockResolvedValue([{ subSpec: '센서' }, { subSpec: ' 센서 ' }]);

        const res = await call();

        expect(res.status).toBe(200);
        expect(createManyTech).not.toHaveBeenCalled();
    });

    it('공백과 줄바꿈만 다른 WS-10 항목은 기존 기술특성을 다시 만들지 않는다', async () => {
        findManyTech.mockResolvedValue([{ id: 'tech_1', name: '처리  속도', groupIndex: 0, columnOrder: 0 }]);
        findManyTechTree.mockResolvedValue([{ subSpec: '처리 속도' }, { subSpec: '처리\n속도' }]);

        expect((await call()).status).toBe(200);
        expect(createManyTech).not.toHaveBeenCalled();
    });

    it('VIEWER 는 조회만 해도 자동 채움 쓰기가 일어나지 않는다', async () => {
        requireProjectAccess.mockResolvedValue({ user: USER, role: 'VIEWER' });
        findManyTech.mockResolvedValue([{ id: 'tech_1', name: '센서', groupIndex: 0, columnOrder: 0 }]);

        const res = await call();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(updateTech).not.toHaveBeenCalled();
        expect(updateProject).not.toHaveBeenCalled();
        expect(createManyTech).not.toHaveBeenCalled();
        expect(body.technicalCharacteristics).toEqual([{ id: 'tech_1', name: '센서', groupIndex: 0, columnOrder: 0 }]);
    });

    it('COACH 도 조회만 해도 자동 채움 쓰기가 일어나지 않는다', async () => {
        requireProjectAccess.mockResolvedValue({ user: USER, role: 'COACH' });
        findManyTech.mockResolvedValue([{ id: 'tech_1', name: '센서', groupIndex: 0, columnOrder: 0 }]);

        const res = await call();

        expect(res.status).toBe(200);
        expect(createManyTech).not.toHaveBeenCalled();
    });
});

 it('초기화한 뒤 전체 삭제해도 WS-10 세부기능을 다시 만들지 않는다', async () => {
    readProject.mockResolvedValue({ qfdTechnicalInitialized: true });
    findManyTech.mockResolvedValue([]);
    const res = await call();
    expect((await res.json()).technicalCharacteristics).toEqual([]);
    expect(updateTech).not.toHaveBeenCalled();
    expect(createManyTech).not.toHaveBeenCalled();
    expect(updateProject).not.toHaveBeenCalled();
});

it.each(['OWNER', 'VIEWER', 'COACH'])('%s 재조회 시 이미 초기화된 기존 기능도 핵심별로 재배치한다', async role => {
    requireProjectAccess.mockResolvedValue({ user: USER, role });
    readProject.mockResolvedValue({ qfdTechnicalInitialized: true });
    findManyTech.mockResolvedValue([
        { id: 'a', name: '기능 A', groupIndex: 0, columnOrder: 0, unit: 'ms', targetValue: '100' },
        { id: 'b', name: '기능 B', groupIndex: 0, columnOrder: 1, unit: 'h', targetValue: '1' },
    ]);
    findManyTechTree.mockResolvedValue([
        { coreSpec: '핵심 A', subSpec: '기능 A' }, { coreSpec: '핵심 B', subSpec: '기능 B' },
        { coreSpec: '핵심 A', subSpec: '조회로 복원하지 않을 기능' },
    ]);
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).technicalCharacteristics).toEqual([
        { id: 'a', name: '기능 A', groupIndex: 0, columnOrder: 0, unit: 'ms', targetValue: '100' },
        { id: 'b', name: '기능 B', groupIndex: 1, columnOrder: 1, unit: 'h', targetValue: '1' },
    ]);
    expect(createManyTech).not.toHaveBeenCalled();
    if (role === 'OWNER') expect(updateTech).toHaveBeenCalledWith({ where: { id: 'b' }, data: { groupIndex: 1, columnOrder: 1 } });
    else expect(updateTech).not.toHaveBeenCalled();
});
