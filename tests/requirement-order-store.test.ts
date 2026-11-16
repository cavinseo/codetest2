// 고객요구사항 연계 순서 변경이 기존 작성 내용과 ID를 유지하는지 검증한다.
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { synchronizeRequirementLinkedOrder } from '../lib/requirement-order-store';

type Row = { id: string; projectId: string; order: number; [key: string]: unknown };
type ModelName = 'techTreeEntry' | 'improvementItem' | 'techRoadmap' | 'targetSpec';
type State = Record<ModelName, Row[]>;
type Requirement = { id: string; requirement: string };
const PROJECT_ID = 'requirement-linked-project';
const modelNames: ModelName[] = ['techTreeEntry', 'improvementItem', 'techRoadmap', 'targetSpec'];
const a = { id: 'r-a', requirement: '고객 요구 A' };
const b = { id: 'r-b', requirement: '고객 요구 B' };
const c = { id: 'r-c', requirement: '고객 요구 C' };

function fixture() {
    const row = (id: string, order: number, fields: Record<string, unknown>): Row => ({ id, projectId: PROJECT_ID, order, ...fields });
    const state: State = {
        techTreeEntry: [
            row('tree-b', 0, { customerVoice: b.requirement, coreSpec: '핵심 B', subSpec: '세부 B', techCharacteristic: '기술 B 작성 내용' }),
            row('tree-a', 1, { customerVoice: a.requirement, coreSpec: '핵심 A', subSpec: '세부 A', techCharacteristic: '기술 A 작성 내용' }),
            row('tree-c', 2, { customerVoice: c.requirement, coreSpec: '핵심 C', subSpec: '세부 C', techCharacteristic: '기술 C 작성 내용' }),
        ],
        improvementItem: [
            row('need-b', 0, { type: 'need', content: b.requirement, improvementRate: '2.5', devProportion: '35%', priority: '높음' }),
            row('feature-b', 0, { type: 'feature', content: b.requirement, improvementRate: '오경보 개선', devProportion: '센서 보완', priority: '1' }),
            row('need-a', 1, { type: 'need', content: a.requirement, improvementRate: '1.25', devProportion: '25%', priority: '보통' }),
            row('feature-a', 1, { type: 'feature', content: a.requirement, improvementRate: '고장 복구 개선', devProportion: '자동 진단', priority: '2' }),
            row('need-c', 2, { type: 'need', content: c.requirement, improvementRate: '3', devProportion: '40%', priority: '낮음' }),
            row('feature-c', 2, { type: 'feature', content: c.requirement, improvementRate: '운용성 개선', devProportion: '태그 통합', priority: '3' }),
        ],
        techRoadmap: [
            row('roadmap-b', 0, { category: b.requirement, techItem: '분기별 개발 B', currentLevel: '현재 B', targetLevel: '목표 B', q1: '설계 B', q2: '구현 B', q3: '검증 B', q4: '출시 B', owner: '담당 B' }),
            row('roadmap-a', 1, { category: a.requirement, techItem: '분기별 개발 A', currentLevel: '현재 A', targetLevel: '목표 A', q1: '설계 A', q2: '구현 A', q3: '검증 A', q4: '출시 A', owner: '담당 A' }),
            row('roadmap-c', 2, { category: c.requirement, techItem: '분기별 개발 C', currentLevel: '현재 C', targetLevel: '목표 C', q1: '설계 C', q2: '구현 C', q3: '검증 C', q4: '출시 C', owner: '담당 C' }),
        ],
        targetSpec: [
            row('target-b', 0, { category: '핵심 B', subCategory: '세부 B', specItem: '작성한 측정항목 B', unit: 'ms', currentValue: '50', competitorValue: '40', targetValue: '30', note: '목표 메모 B' }),
            row('target-a', 1, { category: '핵심 A', subCategory: '세부 A', specItem: '작성한 측정항목 A', unit: '%', currentValue: '80', competitorValue: '90', targetValue: '95', note: '목표 메모 A' }),
            row('target-c', 2, { category: '핵심 C', subCategory: '세부 C', specItem: '작성한 측정항목 C', unit: 'h', currentValue: '10', competitorValue: '8', targetValue: '5', note: '목표 메모 C' }),
        ],
    };
    const models = Object.fromEntries(modelNames.map(name => [name, {
        findMany: vi.fn(async ({ where }: { where: { projectId: string } }) => state[name]
            .filter(item => item.projectId === where.projectId)
            .sort((left, right) => left.order - right.order)
            .map(item => ({ ...item }))),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string; projectId: string }; data: Record<string, unknown> }) => {
            let count = 0;
            state[name] = state[name].map(item => {
                if (item.id !== where.id || item.projectId !== where.projectId) return item;
                count += 1;
                return { ...item, ...data };
            });
            return { count };
        }),
        create: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
    }])) as Record<ModelName, {
        findMany: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        createMany: ReturnType<typeof vi.fn>;
        deleteMany: ReturnType<typeof vi.fn>;
    }>;
    return { state, models, tx: models as unknown as Prisma.TransactionClient };
}

const orderedIds = (rows: Row[]) => [...rows].sort((left, right) => left.order - right.order).map(row => row.id);

function assertUpdatedById(f: ReturnType<typeof fixture>, before: State) {
    for (const name of modelNames) {
        const model = f.models[name];
        expect(model.findMany).toHaveBeenCalledWith({ where: { projectId: PROJECT_ID }, orderBy: { order: 'asc' } });
        const originals = new Map(before[name].map(row => [row.id, row]));
        const changedIds = f.state[name].filter(row => Object.entries(row).some(([key, value]) => originals.get(row.id)![key] !== value)).map(row => row.id).sort();
        expect(model.updateMany).toHaveBeenCalledTimes(changedIds.length);
        expect(model.updateMany.mock.calls.map(([arg]) => arg.where.id).sort()).toEqual(changedIds);
        for (const [arg] of model.updateMany.mock.calls) {
            expect(arg.where).toEqual({ id: arg.where.id, projectId: PROJECT_ID });
        }
        expect(model.create).not.toHaveBeenCalled();
        expect(model.createMany).not.toHaveBeenCalled();
        expect(model.deleteMany).not.toHaveBeenCalled();
    }
}

function assertPreservedFields(f: ReturnType<typeof fixture>, before: State, rename: (value: unknown) => unknown = value => value) {
    const textFields: Partial<Record<ModelName, string>> = { techTreeEntry: 'customerVoice', improvementItem: 'content', techRoadmap: 'category' };
    for (const name of modelNames) {
        const originals = new Map(before[name].map(row => [row.id, row]));
        for (const row of f.state[name]) {
            const source = originals.get(row.id)!;
            const field = textFields[name];
            expect(row).toEqual({ ...source, ...(field ? { [field]: rename(source[field]) } : {}), order: row.order });
        }
    }
}

describe('고객요구사항에 연결된 기존 작성 데이터 동기화', () => {
    it('재정렬은 각 ID의 기술·need/feature·분기 계획·목표값을 보존하며 order만 갱신한다', async () => {
        const f = fixture();
        const before = structuredClone(f.state);
        const previous = [a, b, c];
        const next = [c, a, b];
        const previousSnapshot = structuredClone(previous);
        const nextSnapshot = structuredClone(next);
        await synchronizeRequirementLinkedOrder(f.tx, PROJECT_ID, previous, next);
        expect(orderedIds(f.state.techTreeEntry)).toEqual(['tree-c', 'tree-a', 'tree-b']);
        expect(orderedIds(f.state.techRoadmap)).toEqual(['roadmap-c', 'roadmap-a', 'roadmap-b']);
        expect(orderedIds(f.state.targetSpec)).toEqual(['target-c', 'target-a', 'target-b']);
        expect(orderedIds(f.state.improvementItem.filter(row => row.type === 'need'))).toEqual(['need-c', 'need-a', 'need-b']);
        expect(orderedIds(f.state.improvementItem.filter(row => row.type === 'feature'))).toEqual(['feature-c', 'feature-a', 'feature-b']);
        for (const name of ['techTreeEntry', 'techRoadmap', 'targetSpec'] as const) {
            expect([...f.state[name]].sort((left, right) => left.order - right.order).map(row => row.order)).toEqual([0, 1, 2]);
        }
        for (const type of ['need', 'feature']) {
            expect(f.state.improvementItem.filter(row => row.type === type).sort((left, right) => left.order - right.order).map(row => row.order)).toEqual([0, 1, 2]);
        }
        assertPreservedFields(f, before);
        assertUpdatedById(f, before);
        expect(previous).toEqual(previousSnapshot);
        expect(next).toEqual(nextSnapshot);
    });

    it('이미 같은 순서·문구로 저장된 행은 다시 저장해도 갱신 쿼리를 보내지 않는다', async () => {
        const f = fixture();
        const before = structuredClone(f.state);
        await synchronizeRequirementLinkedOrder(f.tx, PROJECT_ID, [b, a, c], [b, a, c]);
        expect(f.state).toEqual(before);
        assertUpdatedById(f, before);
        for (const name of modelNames) expect(f.models[name].updateMany).not.toHaveBeenCalled();
    });

    it('이름을 교환해도 갱신 전 스냅샷의 ID를 따라 문구를 한 번씩 바꾸고 다른 내용은 보존한다', async () => {
        const f = fixture();
        const before = structuredClone(f.state);
        const next: Requirement[] = [{ ...b, requirement: a.requirement }, c, { ...a, requirement: b.requirement }];
        await synchronizeRequirementLinkedOrder(f.tx, PROJECT_ID, [a, b, c], next);
        const renamed = (value: unknown) => value === a.requirement ? b.requirement : value === b.requirement ? a.requirement : value;
        expect(orderedIds(f.state.techTreeEntry)).toEqual(['tree-b', 'tree-c', 'tree-a']);
        expect(orderedIds(f.state.techRoadmap)).toEqual(['roadmap-b', 'roadmap-c', 'roadmap-a']);
        expect(orderedIds(f.state.targetSpec)).toEqual(['target-b', 'target-c', 'target-a']);
        expect(orderedIds(f.state.improvementItem.filter(row => row.type === 'need'))).toEqual(['need-b', 'need-c', 'need-a']);
        expect(orderedIds(f.state.improvementItem.filter(row => row.type === 'feature'))).toEqual(['feature-b', 'feature-c', 'feature-a']);
        assertPreservedFields(f, before, renamed);
        assertUpdatedById(f, before);
    });

    it.each(['previous', 'next'] as const)('%s의 중복 문구는 기존 작성 행을 임의의 요구사항 ID로 바꾸지 않는다', async whereDuplicates => {
        const f = fixture();
        const previous = whereDuplicates === 'previous' ? [a, { ...b, requirement: ` ${a.requirement} ` }, c] : [a, b, c];
        const next = whereDuplicates === 'previous'
            ? [{ ...a, requirement: '새로운 첫째 문구' }, { ...b, requirement: a.requirement }, c]
            : [{ ...a, requirement: '중복 변경 문구' }, { ...b, requirement: ' 중복 변경 문구 ' }, c];
        if (whereDuplicates === 'previous') {
            for (const row of f.state.techTreeEntry) if (row.id === 'tree-b') row.customerVoice = a.requirement;
            for (const row of f.state.improvementItem) if (row.id.endsWith('-b')) row.content = a.requirement;
            for (const row of f.state.techRoadmap) if (row.id === 'roadmap-b') row.category = a.requirement;
        }
        const before = structuredClone(f.state);
        await synchronizeRequirementLinkedOrder(f.tx, PROJECT_ID, previous, next);
        assertPreservedFields(f, before);
        assertUpdatedById(f, before);
        expect(f.state.techTreeEntry.map(row => row.id).sort()).toEqual(before.techTreeEntry.map(row => row.id).sort());
        expect(f.state.improvementItem.map(row => row.id).sort()).toEqual(before.improvementItem.map(row => row.id).sort());
    });

    it('미입력 null 문구와 목표사양은 저장 실패나 내용 초기화 없이 기존 ID에 남긴다', async () => {
        const f = fixture();
        f.state.techTreeEntry[0].customerVoice = null;
        f.state.improvementItem[0].content = null;
        f.state.techRoadmap[0].category = null;
        f.state.targetSpec[0].category = null;
        f.state.targetSpec[0].subCategory = null;
        const before = structuredClone(f.state);
        await expect(synchronizeRequirementLinkedOrder(f.tx, PROJECT_ID, [a, b, c], [c, a, b])).resolves.toBeUndefined();
        assertPreservedFields(f, before);
        assertUpdatedById(f, before);
    });

    it('공백 요구사항에 이름을 추가해도 기존 공백·null 작성 행을 새 문항에 연결하지 않는다', async () => {
        const f = fixture();
        f.state.techTreeEntry[0].customerVoice = ' \t ';
        f.state.techTreeEntry.push({ id: 'tree-null', projectId: PROJECT_ID, order: 3, customerVoice: null, coreSpec: '기존 공백 핵심', subSpec: '기존 공백 세부', techCharacteristic: '보존할 미연결 기술' });
        f.state.improvementItem[0].content = null;
        f.state.improvementItem[1].content = '';
        f.state.techRoadmap[0].category = '   ';
        const before = structuredClone(f.state);
        const empty = { id: 'r-empty', requirement: ' \t ' };
        const renamed = { ...empty, requirement: '새로 이름을 추가한 고객 요구' };
        await synchronizeRequirementLinkedOrder(f.tx, PROJECT_ID, [empty, a, c], [renamed, c, a]);
        assertPreservedFields(f, before);
        assertUpdatedById(f, before);
        expect(f.state.techTreeEntry.find(row => row.id === 'tree-b')?.customerVoice).toBe(' \t ');
        expect(f.state.techTreeEntry.find(row => row.id === 'tree-null')?.customerVoice).toBeNull();
        expect(f.state.improvementItem.find(row => row.id === 'need-b')?.content).toBeNull();
        expect(f.state.improvementItem.find(row => row.id === 'feature-b')?.content).toBe('');
        expect(f.state.techRoadmap.find(row => row.id === 'roadmap-b')?.category).toBe('   ');
        for (const name of modelNames) {
            expect(f.state[name].some(row => Object.values(row).includes(renamed.requirement))).toBe(false);
        }
    });
});
