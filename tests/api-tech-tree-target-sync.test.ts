// WS-10 저장이 WS-12의 신규 세부스펙을 원자적으로 추가하고 기존 목표값을 보존하는지 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => {
    const state: Record<string, Array<Record<string, unknown>>> = {};
    const model = (name: string) => ({
        findMany: vi.fn(async () => state[name] || []),
        deleteMany: vi.fn(async () => { state[name] = []; }),
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
            state[name] = [...(state[name] || []), ...data.map((row, index) => ({ id: `${name}-${(state[name] || []).length + index}`, ...row }))];
        }),
    });
    return { state, techTreeEntry: model('techTreeEntry'), targetSpec: model('targetSpec'), specFunction: model('specFunction'), improvementItem: model('improvementItem'), technicalCharacteristic: model('technicalCharacteristic') };
});
vi.mock('../lib/prisma', () => ({ prisma: {
    techTreeEntry: db.techTreeEntry, targetSpec: db.targetSpec, specFunction: db.specFunction,
    improvementItem: db.improvementItem, technicalCharacteristic: db.technicalCharacteristic,
    $transaction: async (callback: (client: typeof db) => unknown) => callback(db),
} }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: async () => ({ role: 'OWNER' }) }));
const techTree = await import('../app/api/projects/[id]/tech-tree/route');
const target = await import('../app/api/projects/[id]/target-spec/route');
const params = { params: Promise.resolve({ id: 'project' }) };
const post = (entries: unknown) => new NextRequest('http://localhost/api/projects/project/tech-tree', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }),
});
const get = () => new NextRequest('http://localhost/api/projects/project/target-spec');

beforeEach(() => {
    for (const key of Object.keys(db.state)) delete db.state[key];
    vi.clearAllMocks();
    db.state.specFunction = [
        { id: 'core', level: 'CORE', name: '구동', order: 0 },
        { id: 'sub', level: 'SUB', parentId: 'core', name: '기존 기능', technology: '기존 기술', order: 1 },
    ];
});

it('WS-10 신규 세부스펙을 저장하면 WS-12에 색상 구분용 신규 행이 생기고 다시 저장해도 중복되지 않는다', async () => {
    const entries = [{ customerVoice: '더 빠르게', coreSpec: '구동', subSpec: '신규 기능', techCharacteristic: '새 기술', order: 0 }];
    expect((await techTree.POST(post(entries), params)).status).toBe(200);
    const first = await (await target.GET(get(), params)).json();
    expect(first.rows.map((row: { subCategory: string; note: string }) => [row.subCategory, row.note])).toEqual([
        ['기존 기능', '유지'], ['신규 기능', '신규'],
    ]);
    expect(first.rows[1]).toMatchObject({ category: '구동', specItem: '새 기술' });
    expect(first.newSpecs).toEqual([{ category: '구동', subCategory: '신규 기능' }]);
    expect((await techTree.POST(post(entries), params)).status).toBe(200);
    expect(db.state.targetSpec).toHaveLength(2);
});

it('WS-12에서 편집한 목표값은 새 WS-10 항목을 저장해도 유지된다', async () => {
    db.state.targetSpec = [{ id: 'saved', projectId: 'project', category: '구동', subCategory: '기존 기능', specItem: '수정 기술', unit: 'ms', targetValue: '12', note: '개선', order: 0 }];
    expect((await techTree.POST(post([{ coreSpec: '구동', subSpec: '신규 기능', techCharacteristic: '새 기술', order: 0 }]), params)).status).toBe(200);
    expect(db.state.targetSpec[0]).toMatchObject({ id: 'saved', specItem: '수정 기술', targetValue: '12', note: '개선' });
    expect(db.state.targetSpec[1]).toMatchObject({ category: '구동', subCategory: '신규 기능', note: '신규' });
});

it('WS-2에서 선택한 항목과 빈 저장은 WS-12에 신규 항목을 만들지 않는다', async () => {
    expect((await techTree.POST(post([{ coreSpec: '구동', subSpec: '기존 기능', order: 0 }]), params)).status).toBe(200);
    expect(db.targetSpec.createMany).not.toHaveBeenCalled();
    expect((await techTree.POST(post([]), params)).status).toBe(200);
    expect(db.targetSpec.createMany).not.toHaveBeenCalled();
});
