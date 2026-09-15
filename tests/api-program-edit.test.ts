// 프로그램 내용 수정의 역할·소유권·입력 검증과 저장 범위를 확인한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { requireAuth, findUnique, update } = vi.hoisted(() => ({ requireAuth: vi.fn(), findUnique: vi.fn(), update: vi.fn() }));
vi.mock('../lib/auth', () => ({ requireAuth }));
vi.mock('../lib/prisma', () => ({ prisma: { program: { findUnique, update } } }));
const route = await import('../app/api/programs/[id]/route');
const params = { params: Promise.resolve({ id: 'program_1' }) };
const valid = { name: ' 수정 프로그램 ', organization: ' 기관 ', startsAt: '2026-09-01', endsAt: '2026-10-31' };
const call = (body: unknown = valid) => route.PATCH(new NextRequest('http://localhost/api/programs/program_1', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}), params);

beforeEach(() => {
    vi.resetAllMocks();
    requireAuth.mockResolvedValue({ userId: 'manager_1', role: 'PROGRAM_MANAGER' });
    findUnique.mockResolvedValue({ id: 'program_1', managerId: 'manager_1' });
    update.mockResolvedValue({ id: 'program_1', ...valid });
});

describe('프로그램 내용 수정', () => {
    it('수정 핸들러를 제공한다', () => expect(route.PATCH).toBeTypeOf('function'));
    it('로그인 전에는 DB에 접근하지 않는다', async () => {
        requireAuth.mockResolvedValue(NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }));
        expect((await call()).status).toBe(401);
        expect(findUnique).not.toHaveBeenCalled();
    });
    it.each(['MENTEE', 'MENTOR'])('%s는 수정할 수 없다', async role => {
        requireAuth.mockResolvedValue({ userId: 'manager_1', role });
        expect((await call()).status).toBe(403);
        expect(findUnique).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });
    it('다른 매니저의 프로그램은 수정할 수 없다', async () => {
        findUnique.mockResolvedValue({ managerId: 'other' });
        expect((await call()).status).toBe(403);
        expect(update).not.toHaveBeenCalled();
    });
    it.each(['ADMIN', 'PROGRAM_MANAGER'])('%s는 허용된 프로그램의 네 필드만 저장한다', async role => {
        requireAuth.mockResolvedValue({ userId: 'manager_1', role });
        if (role === 'ADMIN') findUnique.mockResolvedValue({ managerId: 'other' });
        expect((await call()).status).toBe(200);
        expect(update).toHaveBeenCalledWith({ where: { id: 'program_1' }, data: {
            name: '수정 프로그램', organization: '기관', startsAt: new Date(valid.startsAt), endsAt: new Date(valid.endsAt),
        }, select: { id: true, name: true, organization: true, startsAt: true, endsAt: true } });
    });
    it.each([
        { name: ' ' }, { organization: '' }, { startsAt: '2026-02-30' }, { endsAt: '2026-08-31' },
        { endsAt: '2026-09-01' }, { endsAt: null }, { managerId: 'attacker' }, { startsAt: 'invalid' },
    ])('잘못된 입력 또는 허용하지 않은 변경을 거절한다. %j', async changes => {
        expect((await call({ ...valid, ...changes })).status).toBe(400);
        expect(update).not.toHaveBeenCalled();
    });
    it('없는 프로그램은 404를 반환한다', async () => {
        findUnique.mockResolvedValue(null);
        expect((await call()).status).toBe(404);
        expect(update).not.toHaveBeenCalled();
    });
    it('동시에 삭제되면 404를 반환한다', async () => {
        update.mockRejectedValue({ code: 'P2025' });
        expect((await call()).status).toBe(404);
    });
    it('저장 실패는 성공으로 표시하지 않는다', async () => {
        update.mockRejectedValue(new Error('database unavailable'));
        expect((await call()).status).toBe(500);
    });
});
