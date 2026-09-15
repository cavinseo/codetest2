// 프로젝트 강제 이관 API의 관리자 인가와 확인 계약을 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { ProjectTransferError } from '../lib/project-transfer';

const m = vi.hoisted(() => ({ auth: vi.fn(), project: vi.fn(), users: vi.fn(), transaction: vi.fn(), preview: vi.fn(), transfer: vi.fn() }));
vi.mock('../lib/authorization', () => ({ requireAdmin: m.auth }));
vi.mock('../lib/prisma', () => ({ prisma: { project: { findUnique: m.project }, user: { findMany: m.users }, $transaction: m.transaction } }));
vi.mock('../lib/project-transfer', async original => ({ ...await original<typeof import('../lib/project-transfer')>(), getProjectTransferPreview: m.preview, executeProjectTransfer: m.transfer }));
import { GET, POST } from '../app/api/admin/projects/[id]/transfer/route';

const context = { params: Promise.resolve({ id: 'project' }) };
const token = 'a'.repeat(64);
const payload = { targetMenteeId: 'target', previewToken: token, confirmed: true };
const request = (body: unknown = payload) => new NextRequest('http://localhost/api/admin/projects/project/transfer', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ userId: 'admin' });
    m.project.mockResolvedValue({ ownerId: 'source' });
    m.users.mockResolvedValue([{ id: 'target', name: '멘티', email: 'target@example.com', program: { id: 'program', name: '프로그램' } }]);
    m.transaction.mockImplementation(async fn => fn('tx'));
    m.preview.mockResolvedValue({ previewToken: token });
});

it.each([401, 403])('인증·관리자 인가 실패 %i에서 읽기와 쓰기를 차단한다', async status => {
    m.auth.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status }));
    expect((await GET(new NextRequest('http://localhost/api/admin/projects/project/transfer'), context)).status).toBe(status);
    expect((await POST(request(), context)).status).toBe(status);
    expect(m.project).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
});

it('후보 조회는 현 소유자를 제외하고 승인·기간·프로그램을 제한한다', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/projects/project/transfer'), context);
    expect(response.status).toBe(200);
    expect((await response.json()).candidates).toHaveLength(1);
    expect(m.users.mock.calls[0][0].where).toEqual({ id: { not: 'source' }, role: 'MENTEE', status: 'APPROVED', programId: { not: null }, OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: expect.any(Date) } }] });
});

it('없는 프로젝트의 후보를 노출하지 않는다', async () => {
    m.project.mockResolvedValue(null);
    expect((await GET(new NextRequest('http://localhost/api/admin/projects/missing/transfer'), context)).status).toBe(404);
    expect(m.users).not.toHaveBeenCalled();
});

it('미리보기는 일관된 읽기 트랜잭션에서 생성한다', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/projects/project/transfer?targetMenteeId=target'), context);
    expect(await response.json()).toEqual({ preview: { previewToken: token } });
    expect(m.preview).toHaveBeenCalledWith('tx', 'project', 'target');
    expect(m.transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead' });
});

it.each([
    {}, { ...payload, confirmed: false }, { ...payload, previewToken: '' }, { ...payload, targetMenteeId: '' }, { ...payload, ownerId: 'arbitrary' },
])('확인하지 않은 또는 임의 변경 필드를 가진 요청을 거절한다. %j', async body => {
    expect((await POST(request(body), context)).status).toBe(400);
    expect(m.transfer).not.toHaveBeenCalled();
});

it('최종 확인과 최신 토큰을 실행 도메인에 전달한다', async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(m.transfer).toHaveBeenCalledWith('tx', 'project', 'target', token);
    expect(m.transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'ReadCommitted' });
});

it.each(['P2034', 'P2003', 'P2025'])('DB 경합 %s는 재확인 409로 응답한다', async code => {
    m.transfer.mockRejectedValue(Object.assign(new Error('private db details'), { code }));
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain('private db details');
});

it.each(['40001', '40P01'])('원시 SQL 잠금 충돌 %s도 409로 응답한다', async code => {
    m.transfer.mockRejectedValue(Object.assign(new Error('raw database details'), { code: 'P2010', meta: { code } }));
    expect((await POST(request(), context)).status).toBe(409);
});

it('미리보기 변경 충돌을 409로 반환한다', async () => {
    m.transfer.mockRejectedValue(new ProjectTransferError('다시 확인하세요.', 409));
    expect((await POST(request(), context)).status).toBe(409);
});

it('잘못된 JSON을 400으로 반환한다', async () => {
    const response = await POST(new NextRequest('http://localhost/api/admin/projects/project/transfer', { method: 'POST', body: '{' }), context);
    expect(response.status).toBe(400);
    expect(m.transfer).not.toHaveBeenCalled();
});
