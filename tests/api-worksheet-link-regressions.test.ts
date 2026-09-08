// 워크시트 연계 API의 원본 조회와 저장 후 재조회 데이터 보존을 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => {
    const state: Record<string, Array<Record<string, unknown>>> = {};
    const model = (name: string) => ({
        findMany: vi.fn(async () => state[name] || []),
        deleteMany: vi.fn(async () => { state[name] = []; }),
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => { state[name] = data.map((row, index) => ({ id: name + index, ...row })); }),
    });
    const models = { targetSpec: model('targetSpec'), specFunction: model('specFunction'), improvementItem: model('improvementItem'), technicalCharacteristic: model('technicalCharacteristic'), fundingPlan: model('fundingPlan'), fundingSource: model('fundingSource'), salesEstimate: model('salesEstimate') };
    return { state, models };
});
vi.mock('../lib/prisma', () => ({ prisma: { ...db.models, $transaction: async (callback: ((client: typeof db.models) => unknown) | Promise<unknown>[]) => typeof callback === 'function' ? callback(db.models) : Promise.all(callback) } }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: async () => ({ role: 'OWNER' }) }));
const target = await import('../app/api/projects/[id]/target-spec/route');
const funding = await import('../app/api/projects/[id]/funding/route');
const params = { params: Promise.resolve({ id: 'project' }) };
const get = () => new NextRequest('http://localhost/api/projects/project/worksheet');
const post = (body: unknown) => new NextRequest('http://localhost/api/projects/project/worksheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => {
    for (const key of Object.keys(db.state)) delete db.state[key];
    vi.clearAllMocks();
});

it('returns WS-2 hierarchy separately from saved WS-12 and preserves hidden fields through POST', async () => {
    db.state.specFunction = [{ id: 'core', level: 'CORE', name: 'Core' }, { id: 'sub', parentId: 'core', level: 'SUB', name: 'Sub', technology: 'Tech' }];
    db.state.targetSpec = [{ id: 'saved', category: 'Core', subCategory: 'Sub', specItem: 'Edited', unit: 'ms', targetValue: '1', currentValue: '9', competitorValue: '5', note: '개선', order: 0 }];
    const first = await (await target.GET(get(), params)).json();
    expect(first.asIsRows).toHaveLength(1);
    expect(first.asIsRows[0]).toMatchObject({ category: 'Core', subCategory: 'Sub', specItem: 'Tech' });
    expect(db.models.specFunction.findMany).toHaveBeenCalledWith({ where: { projectId: 'project' }, orderBy: { order: 'asc' } });
    expect((await target.POST(post({ rows: first.rows }), params)).status).toBe(200);
    const second = await (await target.GET(get(), params)).json();
    expect(second.rows[0]).toMatchObject({ specItem: 'Edited', unit: 'ms', targetValue: '1', currentValue: '9', competitorValue: '5' });
});

it.each([null, 0, 1234.56789])('preserves future revenue %s on POST and repeated GET with changed WS-1 sales', async (value) => {
    db.state.fundingSource = [{ id: 'source', category: '정부자금', year1: '정부:1,234.5' }];
    db.state.salesEstimate = [{ period: 'Y_PLUS_1', amount: 100 }];
    const plans = [{ category: '매출액', item: '매출액', year1: 10, year2: value, year3: value, order: 0 }, { category: '소요자금', item: '생산비용', year1: 10, year2: 20, year3: 30, order: 1 }];
    expect((await funding.POST(post({ plans }), params)).status).toBe(200);
    const first = await (await funding.GET(get(), params)).json();
    expect(first.plans[0]).toMatchObject({ year1: 100, year2: value, year3: value });
    db.state.salesEstimate = [{ period: 'Y_PLUS_1', amount: 200 }];
    const second = await (await funding.GET(get(), params)).json();
    expect(second.plans[0]).toMatchObject({ year1: 200, year2: value, year3: value });
    expect(second.plans[1]).toMatchObject({ year1: 10, year2: 20, year3: 30 });
    expect(second.sources[0].year1).toBe('정부:1,234.5');
    expect(db.models.fundingPlan.createMany).toHaveBeenCalledTimes(1);
});
