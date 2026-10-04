// 격리된 로컬 DB에서 추가 시장 자료의 API 저장·조회와 백업 필드 보존을 검증한다.
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl || databaseUrl === process.env.POSTGRES_PRISMA_URL) throw new Error('분리된 로컬 테스트 DB가 필요합니다.');
const address = new URL(databaseUrl);
if (address.hostname !== '127.0.0.1' || address.pathname !== '/overview_market_qa_20261004') throw new Error('추가 시장 자료 검증 전용 로컬 DB만 허용합니다.');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
vi.mock('../../lib/authorization', () => ({ requireProjectAccess: async () => ({ user: { userId: ownerId }, role: 'OWNER' }) }));
const { GET, PATCH } = await import('../../app/api/projects/[id]/overview/route');
const { GET: exportProject } = await import('../../app/api/projects/[id]/export/route');
const { POST: importProject } = await import('../../app/api/projects/[id]/import-json/route');
const ownerId = randomUUID();
const programId = randomUUID();
let projectId: string;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (id: string, method = 'GET', body?: unknown) => new NextRequest(`http://localhost/api/projects/${id}/overview`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
const text = '시장 동향과 규모\n  출처: 검증용 시장 자료\n' + '한글 상세 자료 '.repeat(1000);

beforeAll(async () => {
    await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.test`, passwordHash: 'test', status: 'APPROVED' } });
    await db.program.create({ data: { id: programId, name: '로컬 검증', organization: 'QA', startsAt: new Date(), endsAt: new Date('2099-01-01'), managerId: ownerId } });
    projectId = (await db.project.create({ data: { name: '시장자료 검증', ownerId, programId, detailedDescription: '기존 개요', marketDefinition: '기존 시장정의' } })).id;
});
afterAll(async () => {
    await db.project.deleteMany({ where: { ownerId } });
    await db.program.deleteMany({ where: { id: programId } });
    await db.user.deleteMany({ where: { id: ownerId } });
    await db.$disconnect();
});

it('긴 자료를 저장·재조회하고 JSON에 포함하며 복원 시 보존한다', async () => {
    expect((await PATCH(request(projectId, 'PATCH', { name: '시장자료 검증', detailedDescription: '기존 개요', additionalMarketData: text }), params(projectId))).status).toBe(200);
    expect((await (await GET(request(projectId), params(projectId))).json()).project.additionalMarketData).toBe(text);
    const stored = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(stored).toMatchObject({ detailedDescription: '기존 개요', marketDefinition: '기존 시장정의', additionalMarketData: text });
    const backup = await (await exportProject(request(projectId), params(projectId))).json();
    expect(backup.project.additionalMarketData).toBe(text);
    const target = await db.project.create({ data: { name: '복원 대상', ownerId, programId } });
    const restored = await importProject(request(target.id, 'POST', { project: backup.project, specFunctions: [{ level: 'CORE', name: '핵심 기능' }] }), params(target.id));
    expect(restored.status).toBe(200);
    expect((await db.project.findUniqueOrThrow({ where: { id: target.id } })).additionalMarketData).toBe(text);
});

it('과도한 입력은 거절하고 필드 생략과 명시적 삭제를 구분한다', async () => {
    await db.project.update({ where: { id: projectId }, data: { additionalMarketData: '유지할 자료' } });
    expect((await PATCH(request(projectId, 'PATCH', { name: '시장자료 검증', additionalMarketData: '가'.repeat(20001) }), params(projectId))).status).toBe(400);
    expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).additionalMarketData).toBe('유지할 자료');
    await PATCH(request(projectId, 'PATCH', { name: '이름만 변경' }), params(projectId));
    expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).additionalMarketData).toBe('유지할 자료');
    await PATCH(request(projectId, 'PATCH', { name: '이름만 변경', additionalMarketData: '' }), params(projectId));
    expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).additionalMarketData).toBe('');
});
