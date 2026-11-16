// 고객요구사항 그룹 순서 변경이 저장된 Kano 문항과 응답·QFD 연결을 보존하는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Requirement = {
    id: string;
    projectId: string;
    category: string;
    subcategory: string | null;
    requirement: string;
    kanoPositiveQ: string | null;
    kanoNegativeQ: string | null;
    kanoWeight: number | null;
    order: number;
};
type LinkedRow = { id: string; requirementId: string; [key: string]: unknown };

const db = vi.hoisted(() => {
    const state = {
        requirements: [] as Requirement[],
        responses: [] as LinkedRow[],
        relationships: [] as LinkedRow[],
        removedIds: [] as string[],
    };
    type Where = { projectId: string; id?: string | { notIn?: string[]; in?: string[] } };
    const matches = (row: Requirement, where: Where) => row.projectId === where.projectId
        && (typeof where.id === 'string' ? row.id === where.id : !where.id
            || (where.id.in ? where.id.in.includes(row.id) : !where.id.notIn?.includes(row.id)));
    const model = {
        findMany: vi.fn(async ({ where, orderBy, select }: { where: Where; orderBy?: { order: string }; select?: Record<string, boolean> }) => {
            const rows = state.requirements.filter(row => matches(row, where)).map(row => ({ ...row }));
            if (orderBy?.order === 'asc') rows.sort((left, right) => left.order - right.order);
            return select ? rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => select[key]))) : rows;
        }),
        count: vi.fn(async ({ where }: { where: Where }) => state.requirements.filter(row => matches(row, where)).length),
        deleteMany: vi.fn(async ({ where }: { where: Where }) => {
            const removed = state.requirements.filter(row => matches(row, where)).map(row => row.id);
            state.removedIds.push(...removed);
            state.requirements = state.requirements.filter(row => !removed.includes(row.id));
            state.responses = state.responses.filter(row => !removed.includes(row.requirementId));
            state.relationships = state.relationships.filter(row => !removed.includes(row.requirementId));
            return { count: removed.length };
        }),
        updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<Requirement> }) => {
            const provided = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
            let count = 0;
            state.requirements = state.requirements.map(row => {
                if (!matches(row, where)) return row;
                count += 1;
                return { ...row, ...provided };
            });
            return { count };
        }),
        create: vi.fn(async ({ data }: { data: Requirement }) => {
            state.requirements.push({ ...data });
            return { ...data };
        }),
        createMany: vi.fn(async ({ data }: { data: Requirement[] }) => {
            state.requirements.push(...data.map(row => ({ ...row })));
            return { count: data.length };
        }),
    };
    const downstreamModel = () => ({
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
    });
    const models = {
        customerRequirement: model,
        kanoResponse: { count: vi.fn(async () => state.responses.length) },
        qFDMatrix: { count: vi.fn(async () => state.relationships.length) },
        benchmark: { count: vi.fn(async () => 0) },
        techTreeEntry: downstreamModel(),
        improvementItem: downstreamModel(),
        techRoadmap: downstreamModel(),
        targetSpec: downstreamModel(),
    };
    return { state, models };
});

vi.mock('../lib/prisma', () => ({ prisma: {
    ...db.models,
    $transaction: async (callback: (client: typeof db.models) => Promise<unknown>) => callback(db.models),
} }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: vi.fn(async () => ({ role: 'OWNER' })) }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

import { GET, POST } from '../app/api/projects/[id]/requirements/route';
import { requireProjectAccess } from '../lib/authorization';

const PROJECT_ID = 'project-order-sync';
const params = { params: Promise.resolve({ id: PROJECT_ID }) };
const idsInWorksheetOrder = ['r1', 'r3', 'r2'];

function request(body?: unknown) {
    return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/requirements`, body === undefined ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
}

function worksheetRows() {
    return db.state.requirements.map(({ id, category, subcategory, requirement, order }) => ({ id, category, subcategory, requirement, order }));
}

function storedById() {
    return Object.fromEntries(db.state.requirements.map(row => [row.id, row]));
}

beforeEach(() => {
    vi.clearAllMocks();
    db.state.requirements = [
        { id: 'r1', projectId: PROJECT_ID, category: '정비', subcategory: '무인 운용', requirement: '정비 첫째', kanoPositiveQ: '정비 첫째 저장 긍정?', kanoNegativeQ: '정비 첫째 저장 부정?', kanoWeight: 2.5, order: 0 },
        { id: 'r2', projectId: PROJECT_ID, category: '품질', subcategory: '신뢰', requirement: '품질 첫째', kanoPositiveQ: '품질 첫째 저장 긍정?', kanoNegativeQ: '품질 첫째 저장 부정?', kanoWeight: 0, order: 1 },
        { id: 'r3', projectId: PROJECT_ID, category: '정비', subcategory: '무인 운용', requirement: '정비 둘째', kanoPositiveQ: '정비 둘째 저장 긍정?', kanoNegativeQ: '정비 둘째 저장 부정?', kanoWeight: 4, order: 2 },
    ];
    db.state.responses = [
        { id: 'response-r2', requirementId: 'r2', invitationId: 'invitation-1', positiveAnswer: 1, negativeAnswer: 5, kanoCategory: 'O' },
        { id: 'response-r1', requirementId: 'r1', invitationId: 'invitation-1', positiveAnswer: 2, negativeAnswer: 5, kanoCategory: 'M' },
        { id: 'response-r3', requirementId: 'r3', invitationId: 'invitation-1', positiveAnswer: 1, negativeAnswer: 3, kanoCategory: 'A' },
    ];
    db.state.relationships = [
        { id: 'qfd-r3', requirementId: 'r3', technicalCharId: 'tech-1', strength: 'STRONG' },
        { id: 'qfd-r1', requirementId: 'r1', technicalCharId: 'tech-1', strength: 'WEAK' },
        { id: 'qfd-r2', requirementId: 'r2', technicalCharId: 'tech-2', strength: 'MEDIUM' },
    ];
    db.state.removedIds = [];
});

describe('고객요구사항과 후속 워크시트의 기준 순서', () => {
    it('GET은 저장 순서에 흩어진 항목도 2차→1차 그룹 순서로 반환하고 읽기만 한다', async () => {
        const before = structuredClone(db.state);
        const response = await GET(request(), params);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.requirements.map((row: Requirement) => row.id)).toEqual(idsInWorksheetOrder);
        expect(body.requirements.map((row: Requirement) => row.order)).toEqual([0, 1, 2]);
        const source = Object.fromEntries(before.requirements.map(row => [row.id, row]));
        for (const row of body.requirements) {
            const { projectId: _projectId, ...expected } = source[row.id];
            expect(row).toEqual({ ...expected, order: idsInWorksheetOrder.indexOf(row.id) });
        }
        expect(db.state).toEqual(before);
        expect(db.models.customerRequirement.updateMany).not.toHaveBeenCalled();
        expect(db.models.customerRequirement.deleteMany).not.toHaveBeenCalled();
        expect(db.models.customerRequirement.create).not.toHaveBeenCalled();
    });

    it('POST는 그룹 순서로 order를 다시 매기며 기존 ID와 응답·QFD 연결을 재생성하지 않는다', async () => {
        const before = structuredClone(db.state);
        const response = await POST(request({ requirements: worksheetRows() }), params);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ success: true, count: 3 });
        const stored = [...db.state.requirements].sort((left, right) => left.order - right.order);
        expect(stored.map(row => row.id)).toEqual(idsInWorksheetOrder);
        expect(stored.map(row => row.order)).toEqual([0, 1, 2]);
        expect(db.state.removedIds).toEqual([]);
        expect(db.models.customerRequirement.create).not.toHaveBeenCalled();
        expect(db.models.customerRequirement.updateMany).toHaveBeenCalledTimes(3);
        expect(db.state.responses).toEqual(before.responses);
        expect(db.state.relationships).toEqual(before.relationships);
        for (const row of before.requirements) {
            expect(storedById()[row.id]).toEqual({ ...row, order: idsInWorksheetOrder.indexOf(row.id) });
        }
    });

    it('WS-5 저장에서 생략한 질문과 수동 가중치는 재저장·GET 뒤에도 ID에 연결된 값으로 남는다', async () => {
        const before = storedById();
        const rows = worksheetRows().map(row => row.id === 'r2' ? { ...row, category: '운용', subcategory: '무인 운용' } : row);
        expect((await POST(request({ requirements: rows }), params)).status).toBe(200);
        const read = await (await GET(request(), params)).json();
        expect(read.requirements.map((row: Requirement) => row.id)).toEqual(idsInWorksheetOrder);
        for (const row of read.requirements) {
            expect(row.kanoPositiveQ).toBe(before[row.id].kanoPositiveQ);
            expect(row.kanoNegativeQ).toBe(before[row.id].kanoNegativeQ);
            expect(row.kanoWeight).toBe(before[row.id].kanoWeight);
        }
        expect((await POST(request({ requirements: rows }), params)).status).toBe(200);
        for (const row of db.state.requirements) {
            expect(row.kanoPositiveQ).toBe(before[row.id].kanoPositiveQ);
            expect(row.kanoNegativeQ).toBe(before[row.id].kanoNegativeQ);
            expect(row.kanoWeight).toBe(before[row.id].kanoWeight);
        }
        expect(db.models.customerRequirement.create).not.toHaveBeenCalled();
        expect(db.state.removedIds).toEqual([]);
    });

    it('담당 멘토가 명시적으로 null을 보낸 문항·가중치만 초기화하고 다른 항목과 연결 데이터는 보존한다', async () => {
        vi.mocked(requireProjectAccess).mockResolvedValueOnce({ role: 'EDITOR', user: { userId: 'mentor', role: 'MENTOR' } } as never);
        const before = structuredClone(db.state);
        const rows = worksheetRows().map(row => row.id === 'r3' ? {
            ...row, kanoPositiveQ: null, kanoNegativeQ: null, kanoWeight: null,
        } : row);
        const response = await POST(request({ requirements: rows }), params);
        expect(response.status).toBe(200);
        const saved = storedById();
        for (const row of before.requirements) {
            expect(saved[row.id]).toEqual({
                ...row,
                ...(row.id === 'r3' ? { kanoPositiveQ: null, kanoNegativeQ: null, kanoWeight: null } : {}),
                order: idsInWorksheetOrder.indexOf(row.id),
            });
        }
        expect(db.state.responses).toEqual(before.responses);
        expect(db.state.relationships).toEqual(before.relationships);
        expect(db.state.removedIds).toEqual([]);
        expect(db.models.customerRequirement.create).not.toHaveBeenCalled();
    });
});
