// 개요의 읽기·쓰기 개정값 계약과 오래된 화면 및 트랜잭션 충돌을 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ row: {} as Record<string, unknown>, transaction: vi.fn(), update: vi.fn() }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: async () => ({ role: 'OWNER', user: { userId: 'u' } }) }));
vi.mock('../lib/prisma', () => {
    const project = { findUnique: async () => m.row, update: m.update };
    return { prisma: new Proxy({ project, $transaction: m.transaction }, { get: (o, key) => key in o ? o[key as keyof typeof o] : { count: async () => 0, findUnique: async () => null } }) };
});
import { GET, PATCH } from '../app/api/projects/[id]/overview/route';
const params = { params: Promise.resolve({ id: 'p' }) };
const read = () => GET(new NextRequest('http://localhost/api/projects/p/overview'), params);
const write = (body: unknown, revision?: string) => PATCH(new NextRequest('http://localhost/api/projects/p/overview', { method: 'PATCH', headers: revision ? { 'If-Match': revision } : {}, body: JSON.stringify(body) }), params);
beforeEach(() => {
    vi.clearAllMocks(); m.row = { id: 'p', name: '프로젝트', description: '기존 설명', detailedDescription: null, companyName: null, owner: { profile: null }, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') };
    m.update.mockImplementation(async ({ data }) => { m.row = { ...m.row, ...data }; return m.row; });
    m.transaction.mockImplementation(async callback => callback({ project: { findUnique: async () => m.row, update: m.update } }));
});
it('A 저장 후 같은 읽기 버전을 가진 B의 저장을 409로 거부하고 A 입력을 보존한다', async () => {
    const initial = await (await read()).json(); expect(initial.revision).toMatch(/^[a-f0-9]{64}$/);
    const a = await write({ name: '프로젝트', description: 'A 설명' }, initial.revision);
    expect(a.status).toBe(200); const saved = await a.json(); expect(saved.revision).not.toBe(initial.revision);
    const b = await write({ name: 'B 이름', description: '기존 설명' }, initial.revision);
    expect(b.status).toBe(409); expect(m.row.description).toBe('A 설명'); expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'Serializable' });
    expect((await write({ name: '새 이름', description: 'A 설명' }, saved.revision)).status).toBe(200);
});
it('개정값이 없는 저장은 428로 거부한다', async () => {
    expect((await write({ name: '변경' })).status).toBe(428); expect(m.update).not.toHaveBeenCalled();
});
it('동시 트랜잭션 충돌도 409로 안내한다', async () => {
    const initial = await (await read()).json(); m.transaction.mockRejectedValueOnce({ code: 'P2034' });
    expect((await write({ name: '변경' }, initial.revision)).status).toBe(409);
});
