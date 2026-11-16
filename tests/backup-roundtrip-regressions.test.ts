// 실제 백업 핸들러의 왕복과 개요 필드·구버전·검증 경계를 메모리 DB로 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { serializeBusinessPlanFile } from '../lib/business-plan-file';
const db = vi.hoisted(() => ({ source: {} as Record<string, unknown>, target: {} as Record<string, unknown>, update: vi.fn(), transaction: vi.fn(), deleted: vi.fn() }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: async () => ({ role: 'OWNER', user: { userId: 'review-user' } }) }));
vi.mock('../lib/prisma', () => {
    const models = new Proxy({}, { get: () => ({ count: async () => 0, deleteMany: db.deleted, createMany: vi.fn(), findMany: async () => [] }) });
    return { prisma: new Proxy({ project: { findUnique: async ({ where }: { where: { id: string } }) => where.id === 'source' ? db.source : db.target }, $transaction: db.transaction }, { get: (obj, key) => key in obj ? obj[key as keyof typeof obj] : Reflect.get(models, key) }) };
});
import { GET } from '../app/api/projects/[id]/export/route';
import { POST } from '../app/api/projects/[id]/import-json/route';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1cAAAAASUVORK5CYII=';
const restore = (data: unknown) => POST(new NextRequest('http://localhost/api/projects/target/import-json', { method: 'POST', body: JSON.stringify(data) }), { params: Promise.resolve({ id: 'target' }) });
beforeEach(() => {
    vi.clearAllMocks();
    db.source = { id: 'source', name: '원본', companyName: '테스트 회사', productName: '테스트 제품', description: '설명', detailedDescription: '상세', relatedImages: [{ dataUrl: png, widthPx: 1, heightPx: 1 }], productImageDataUrl: png, productImageWidthPx: 1, productImageHeightPx: 1, marketDefinition: '시장', targetCustomer: '고객', additionalMarketData: '자료', includeAdditionalMarketDataInReport: true, businessPlanFile: serializeBusinessPlanFile({ fileName: 'plan.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,dGVzdA==' }), specDetailCollapsed: false, fitnessMatrix: null };
    for (const key of ['specFunctions','productAttributes','attributeFitnesses','requirements','technicalCharacteristics','qfdMatrices','kanoResponses','techCorrelations','benchmarks','technicalBenchmarks','techTreeEntries','improvementItems','targetSpecs','techRoadmaps','devPlans','salesEstimates','assetItems','fundingPlans','fundingSources']) db.source[key] = [];
    db.target = { id: 'target', name: '대상 이름 유지', companyName: '기존 회사', productName: '기존 제품', businessPlanFile: '기존 첨부', specDetailCollapsed: true };
    db.update.mockImplementation(async ({ data }) => { Object.assign(db.target, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))); return db.target; });
    const tx = new Proxy({ project: { update: db.update }, $queryRaw: vi.fn() }, { get: (obj, key) => key in obj ? obj[key as keyof typeof obj] : { deleteMany: db.deleted, createMany: vi.fn(), findMany: async () => [] } });
    db.transaction.mockImplementation(async callback => callback(tx));
});
it.each([false, true])('현재 export 응답을 수정 없이 복원하고 설정 %s와 개요 필드를 보존한다', async specDetailCollapsed => {
    db.source.specDetailCollapsed = specDetailCollapsed;
    const exported = await GET(new NextRequest('http://localhost/api/projects/source/export'), { params: Promise.resolve({ id: 'source' }) });
    expect(exported.status).toBe(200);
    const payload = await exported.json();
    const response = await restore(payload);
    expect(await response.json()).toMatchObject({ success: true });
    expect(response.status).toBe(200);
    for (const field of ['companyName','productName','relatedImages','productImageDataUrl','productImageWidthPx','productImageHeightPx','marketDefinition','targetCustomer','businessPlanFile','specDetailCollapsed']) expect(db.target[field], field).toEqual(db.source[field]);
    expect(db.target.name).toBe('대상 이름 유지');
    for (const excluded of ['ownerId','members','invitations','worksheetComments','finalReport']) expect(payload).not.toHaveProperty(excluded);
});
it('구버전 백업에 없는 개요 필드와 접힘 설정은 기존 값을 보존한다', async () => {
    const response = await restore({ version: '1.0-prisma', project: { name: '옛 이름', description: '복구 설명' }, specFunctions: [{ level: 'CORE', name: '기능' }] });
    expect(response.status).toBe(200);
    expect(db.target).toMatchObject({ name: '대상 이름 유지', companyName: '기존 회사', productName: '기존 제품', businessPlanFile: '기존 첨부', specDetailCollapsed: true, description: '복구 설명' });
});
it('명시적인 개요 삭제는 복원하되 생략과 구분한다', async () => {
    const response = await restore({ version: '1.1-prisma', exportedAt: '2026-10-10', project: { companyName: '', productName: null, relatedImages: [], marketDefinition: null, targetCustomer: '', businessPlanFile: null }, specDetailCollapsed: false });
    expect(response.status).toBe(200);
    expect(db.target).toMatchObject({ companyName: '', productName: null, relatedImages: [], productImageDataUrl: null, marketDefinition: null, targetCustomer: '', businessPlanFile: null, specDetailCollapsed: false });
});
it.each([
    { companyName: 'x'.repeat(301) }, { productName: 'x'.repeat(301) }, { marketDefinition: 'x'.repeat(20001) },
    { relatedImages: Array.from({ length: 4 }, () => ({ dataUrl: png, widthPx: 1, heightPx: 1 })) },
    { productImageDataUrl: png }, { relatedImages: [{ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', widthPx: 1, heightPx: 1 }] },
    { businessPlanFile: 'business-plan-file:v1:{broken' },
    { businessPlanFile: 'data:text/plain;base64,' + 'A'.repeat(4 * Math.ceil((10 * 1024 * 1024 + 3) / 3)) },
])('잘못된 추가 필드는 삭제나 저장 전에 거부한다 %#', async project => {
    expect((await restore({ version: '1.1-prisma', exportedAt: '2026-10-10', project })).status).toBe(400);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.deleted).not.toHaveBeenCalled();
});
