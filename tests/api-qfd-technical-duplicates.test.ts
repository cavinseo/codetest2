// 기술특성 추가·이름 변경의 중복 차단과 기존 데이터 보존을 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const existing = [
    { id: 't1', name: '처리  속도', groupIndex: 0, columnOrder: 0, unit: 'ms', targetValue: '100' },
    { id: 't2', name: '백업 주기', groupIndex: 1, columnOrder: 1, unit: 'h', targetValue: '1' },
];
const findMany = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const updateProject = vi.fn();
const lock = vi.fn();
const requireProjectAccess = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({
        $queryRaw: lock, technicalCharacteristic: { findMany, findFirst, create, update },
        project: { update: updateProject },
    }) },
}));
vi.mock('../lib/authorization', () => ({ requireProjectAccess }));
const { POST, PATCH } = await import('../app/api/projects/[id]/qfd/technical/route');

function call(method: 'POST' | 'PATCH', body: object) {
    const request = new NextRequest('http://localhost/api/projects/p1/qfd/technical', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return (method === 'POST' ? POST : PATCH)(request, { params: Promise.resolve({ id: 'p1' }) });
}

beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ role: 'OWNER' });
    findMany.mockImplementation(async ({ where }) => existing.filter(row => row.id !== where.NOT?.id));
    findFirst.mockImplementation(async ({ where }) => existing.find(row => row.id === where.id || row.name === where.name) ?? null);
    create.mockImplementation(async ({ data }) => data);
    update.mockImplementation(async ({ where, data }) => ({ ...existing.find(row => row.id === where.id), ...data }));
});

describe('기술특성 중복 방지', () => {
    it.each(['처리 속도', ' 처리\n속도 ', '처리 속도'.normalize('NFD')])('다른 그룹에서도 같은 기술특성 %s 추가를 차단한다', async name => {
        const response = await call('POST', { name, groupIndex: 1 });
        expect(response.status).toBe(409);
        expect(create).not.toHaveBeenCalled();
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('다른 열과 중복되는 이름으로 변경하면 기존 ID·단위·목표치를 유지한다', async () => {
        const response = await call('PATCH', { id: 't2', name: '처리\n속도', unit: 's', targetValue: '200' });
        expect(response.status).toBe(409);
        expect(update).not.toHaveBeenCalled();
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('자신의 이름을 정리하며 단위·목표치를 수정할 수 있다', async () => {
        const response = await call('PATCH', { id: 't1', name: '처리 속도', unit: 's', targetValue: '0.1' });
        expect(response.status).toBe(200);
        expect((await response.json()).technicalCharacteristic).toEqual({ ...existing[0], name: '처리 속도', unit: 's', targetValue: '0.1' });
        expect(update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { name: '처리 속도', unit: 's', targetValue: '0.1' } });
    });

    it('새 기능은 공백을 정리한 이름으로 같은 그룹에 추가한다', async () => {
        const response = await call('POST', { name: ' 측정\n정확도 ', groupIndex: 1 });
        expect(response.status).toBe(200);
        expect((await response.json()).technicalCharacteristic).toMatchObject({ name: '측정 정확도', groupIndex: 1 });
    });

    it('수정할 기술특성의 프로젝트 소속과 쓰기 권한을 확인한다', async () => {
        expect((await call('PATCH', { id: 'foreign', name: '새 기능' })).status).toBe(404);
        requireProjectAccess.mockResolvedValue(NextResponse.json({ error: '권한 없음' }, { status: 403 }));
        expect((await call('POST', { name: '새 기능' })).status).toBe(403);
        expect(update).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });
});
