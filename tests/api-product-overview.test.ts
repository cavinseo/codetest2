// 개요의 신규 제품 정보 저장·조회·권한·기존 값 보존을 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { validateProductOverview } from '../lib/product-overview';

const m = vi.hoisted(() => ({ access: vi.fn(), update: vi.fn(), find: vi.fn(), count: vi.fn(), fitness: vi.fn() }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: m.access }));
vi.mock('../lib/prisma', () => ({ prisma: {
    project: { findUnique: m.find, update: m.update },
    ...Object.fromEntries(['salesEstimate', 'specFunction', 'productAttribute', 'attributeFitness', 'customerRequirement', 'kanoResponse', 'technicalCharacteristic', 'qFDMatrix', 'techTreeEntry', 'improvementItem', 'targetSpec', 'techRoadmap', 'devPlan', 'assetItem', 'fundingPlan', 'fundingSource'].map(key => [key, { count: m.count }])),
    fitnessMatrix: { findUnique: m.fitness },
} }));
import { GET, PATCH } from '../app/api/projects/[id]/overview/route';
const params = { params: Promise.resolve({ id: 'p' }) };
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1cAAAAASUVORK5CYII=';
const details = { productName: '새 제품', marketDefinition: '국내 교육 시장', targetCustomer: '초등학교 교사', productImageDataUrl: png, productImageWidthPx: 1, productImageHeightPx: 1 };
const request = (body?: unknown) => new NextRequest('http://localhost/api/projects/p/overview', body === undefined ? {} : { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
let stored: Record<string, unknown>;
beforeEach(() => {
    vi.clearAllMocks();
    stored = { id: 'p', name: '기존 프로젝트', description: '기존 설명', detailedDescription: '상세', createdAt: new Date(), updatedAt: new Date(), ...details };
    m.access.mockResolvedValue({ role: 'OWNER', user: { userId: 'mentee', role: 'MENTEE' } });
    m.update.mockImplementation(async ({ data }) => (stored = { ...stored, ...data }));
    m.find.mockImplementation(async () => stored);
    m.count.mockResolvedValue(0); m.fitness.mockResolvedValue(null);
});
it('제품명·이미지·시장·고객을 저장하고 새 요청으로 조회한다', async () => {
    const saved = await PATCH(request({ name: '프로젝트', ...details }), params);
    expect(saved.status).toBe(200);
    expect((await saved.json()).project).toMatchObject(details);
    const loaded = await GET(request(), params);
    expect((await loaded.json()).project).toMatchObject({ ...details, name: '프로젝트' });
    expect(m.find.mock.calls[0][0].select).toMatchObject({ productName: true, productImageDataUrl: true, marketDefinition: true, targetCustomer: true });
});
it('기존 저장 요청이 신규 필드를 생략하면 저장된 제품 정보를 보존한다', async () => {
    await PATCH(request({ name: '이름만 변경', description: '기존 설명' }), params);
    expect(stored).toMatchObject(details);
    expect(m.update.mock.calls[0][0].data).not.toHaveProperty('productName');
    expect(m.update.mock.calls[0][0].data).not.toHaveProperty('productImageDataUrl');
});
it('이미지를 제거하면 치수도 함께 제거한다', async () => {
    await PATCH(request({ name: '프로젝트', productImageDataUrl: null }), params);
    expect(stored).toMatchObject({ productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null });
});
it.each([
    { productName: 'x'.repeat(301) }, { marketDefinition: 'x'.repeat(20_001) },
    { productImageDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { productImageDataUrl: 'https://example.test/image.png' },
    { productImageDataUrl: 'data:image/png;base64,YWJjZA==', productImageWidthPx: 1, productImageHeightPx: 1 },
    { productImageDataUrl: png.replace('image/png', 'image/jpeg'), productImageWidthPx: 1, productImageHeightPx: 1 },
    { productImageDataUrl: png }, { productImageWidthPx: 10 },
    { productImageDataUrl: png, productImageWidthPx: -1, productImageHeightPx: 1 },
    { productImageDataUrl: 'data:image/png;base64,' + 'a'.repeat(1_000_000), productImageWidthPx: 1, productImageHeightPx: 1 },
])('잘못된 제품 정보는 저장하지 않는다 %#', async patch => {
    expect((await PATCH(request({ name: '프로젝트', ...patch }), params)).status).toBe(400);
    expect(m.update).not.toHaveBeenCalled();
    expect(stored.productImageDataUrl).toBe(png);
});
it('미배정 멘토의 개요 수정은 공통 쓰기 권한 검사에서 거절한다', async () => {
    m.access.mockResolvedValue(NextResponse.json({ error: 'denied' }, { status: 403 }));
    expect((await PATCH(request({ name: '변경', ...details }), params)).status).toBe(403);
    expect(m.access).toHaveBeenCalledWith(expect.anything(), 'p', { write: true });
    expect(m.update).not.toHaveBeenCalled();
});
it('제품 정보 검증은 입력 객체를 변경하지 않는다', () => {
    const input = { ...details, productName: '  제품  ' };
    expect(validateProductOverview(input).productName).toBe('제품');
    expect(input.productName).toBe('  제품  ');
});

it('관련이미지 3개를 저장·조회하고 첫 이미지는 기존 단일 이미지 필드에도 보존한다', async () => {
    const relatedImages = [1, 2, 3].map(widthPx => ({ dataUrl: png, widthPx, heightPx: 1 }));
    const response = await PATCH(request({ name: '프로젝트', relatedImages }), params);
    expect(response.status).toBe(200);
    expect((await response.json()).project).toMatchObject({ relatedImages, productImageDataUrl: png, productImageWidthPx: 1 });
    expect((await (await GET(request(), params)).json()).project.relatedImages).toEqual(relatedImages);
    expect(m.find.mock.calls[0][0].select.relatedImages).toBe(true);
    await PATCH(request({ name: '이름만 변경' }), params);
    expect(stored.relatedImages).toEqual(relatedImages);
});

it('기존 단일 이미지를 목록으로 조회하며 전체 삭제 후 다시 나타나지 않는다', async () => {
    expect((await (await GET(request(), params)).json()).project.relatedImages).toEqual([{ dataUrl: png, widthPx: 1, heightPx: 1 }]);
    await PATCH(request({ name: '프로젝트', relatedImages: [] }), params);
    expect(stored).toMatchObject({ relatedImages: [], productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null });
    expect((await (await GET(request(), params)).json()).project.relatedImages).toEqual([]);
});

it.each([
    { relatedImages: Array.from({ length: 4 }, () => ({ dataUrl: png, widthPx: 1, heightPx: 1 })) },
    { relatedImages: [{ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', widthPx: 1, heightPx: 1 }] },
    { relatedImages: [{ dataUrl: png, widthPx: 0, heightPx: 1 }] },
    { relatedImages: [{ dataUrl: png }] },
    { relatedImages: [{ dataUrl: 'data:image/png;base64,' + 'a'.repeat(1_000_000), widthPx: 1, heightPx: 1 }] },
])('잘못된 관련이미지 목록과 3개 초과 요청을 서버에서 거절한다 %#', async ({ relatedImages }) => {
    expect((await PATCH(request({ name: '프로젝트', relatedImages }), params)).status).toBe(400);
    expect(m.update).not.toHaveBeenCalled();
    expect(stored.productImageDataUrl).toBe(png);
});

it('Markdown 들여쓰기와 HTML을 변환하지 않고 저장·조회한다', async () => {
    const richText = {
        detailedDescription: '    <code>들여쓴 코드</code>\n\n# 제품\n\n<strong>특징</strong>\n',
        marketDefinition: '    시장 코드\n\n## 시장\n\n<table><tr><td>규모</td></tr></table>\n',
    };
    const saved = await PATCH(request({ name: '프로젝트', ...richText }), params);
    expect(saved.status).toBe(200);
    expect((await saved.json()).project).toMatchObject(richText);
    expect((await (await GET(request(), params)).json()).project).toMatchObject(richText);
});
it('서식 입력칸을 공백만 남겨 지우면 기존 빈 값 규칙으로 저장한다', async () => {
    await PATCH(request({ name: '프로젝트', detailedDescription: ' \n ', marketDefinition: ' \n ' }), params);
    expect(stored).toMatchObject({ detailedDescription: null, marketDefinition: '' });
});
