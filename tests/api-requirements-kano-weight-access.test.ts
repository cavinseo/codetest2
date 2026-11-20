// 요구사항 편집 API가 내용 수정을 허용하면서 멘토 전용 Kano 가중치는 역할에 따라 보존하는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { ProjectAccess, ProjectAccessRole } from '../lib/authorization';
import type { MemberRole } from '../lib/member-roles';

type Requirement = {
    id: string; projectId: string; category: string; subcategory: string | null; requirement: string;
    kanoPositiveQ: string | null; kanoNegativeQ: string | null; kanoWeight: number | null; order: number;
};
type Where = { projectId: string; id?: string | { notIn?: string[]; in?: string[] } };

const db = vi.hoisted(() => {
    const state = { requirements: [] as Requirement[], removedIds: [] as string[] };
    const matches = (row: Requirement, where: Where) => row.projectId === where.projectId
        && (typeof where.id === 'string' ? row.id === where.id : !where.id
            || (where.id.in ? where.id.in.includes(row.id) : !where.id.notIn?.includes(row.id)));
    const insert = (data: Requirement) => {
        const row = { ...data, kanoPositiveQ: data.kanoPositiveQ ?? null, kanoNegativeQ: data.kanoNegativeQ ?? null, kanoWeight: data.kanoWeight ?? null };
        state.requirements.push(row);
        return row;
    };
    const requirements = {
        findMany: vi.fn(async ({ where }: { where: Where }) => state.requirements.filter(row => matches(row, where)).map(row => ({ ...row }))),
        count: vi.fn(async ({ where }: { where: Where }) => state.requirements.filter(row => matches(row, where)).length),
        deleteMany: vi.fn(async ({ where }: { where: Where }) => {
            const removed = state.requirements.filter(row => matches(row, where)).map(row => row.id);
            state.removedIds.push(...removed);
            state.requirements = state.requirements.filter(row => !removed.includes(row.id));
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
        create: vi.fn(async ({ data }: { data: Requirement }) => insert(data)),
        createMany: vi.fn(async ({ data }: { data: Requirement[] }) => {
            data.forEach(insert);
            return { count: data.length };
        }),
    };
    const linkedModel = () => ({ findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) });
    const models = {
        customerRequirement: requirements,
        kanoResponse: { count: vi.fn(async () => 0) },
        qFDMatrix: { count: vi.fn(async () => 0) },
        benchmark: { count: vi.fn(async () => 0) },
        techTreeEntry: linkedModel(), improvementItem: linkedModel(), techRoadmap: linkedModel(), targetSpec: linkedModel(),
    };
    return { state, models, access: vi.fn(), transaction: vi.fn() };
});
vi.mock('../lib/prisma', () => ({ prisma: { ...db.models, $transaction: db.transaction } }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: db.access }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
import { POST } from '../app/api/projects/[id]/requirements/route';
import { worksheetRevision } from '../lib/worksheet-revision';

const projectId = 'project-weight';
const params = { params: Promise.resolve({ id: projectId }) };
const roles: Array<[MemberRole, ProjectAccessRole, boolean]> = [
    ['MENTEE', 'OWNER', false], ['MENTEE', 'EDITOR', false],
    ['ADMIN', 'ADMIN', false], ['ADMIN', 'OWNER', false], ['ADMIN', 'EDITOR', false],
    ['PROGRAM_MANAGER', 'OWNER', false], ['PROGRAM_MANAGER', 'VIEWER', false],
    ['MENTOR', 'EDITOR', true], ['PROGRAM_MANAGER', 'EDITOR', true],
];
const cases = roles.flatMap(([systemRole, projectRole, canEditWeight]) =>
    [4.5, null].map(weight => [systemRole, projectRole, canEditWeight, weight] as const));

function actor(systemRole: MemberRole, projectRole: ProjectAccessRole): ProjectAccess {
    return {
        role: projectRole,
        user: { userId: 'actor', email: 'actor@example.test', name: null, role: systemRole, isAdmin: systemRole === 'ADMIN', accessExpiresAt: null },
    };
}

function row(id = 'existing', kanoWeight?: number | null) {
    return { id, category: '수정한 1차 그룹', subcategory: '수정한 2차 그룹', requirement: `${id} 수정한 요구사항`, order: 0,
        ...(kanoWeight === undefined ? {} : { kanoWeight }) };
}

// 화면이 GET 으로 받은 개정값을 흉내 낸다. mock findMany 는 정렬 없이 저장 순서로 돌려준다.
function currentRevision() {
    return worksheetRevision(db.state.requirements.filter(item => item.projectId === projectId).map(item => ({ ...item })));
}

function request(requirements: ReturnType<typeof row>[]) {
    return new NextRequest(`http://localhost/api/projects/${projectId}/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'If-Match': currentRevision() },
        body: JSON.stringify({ requirements }),
    });
}

function createdPayloads() {
    return [
        ...db.models.customerRequirement.create.mock.calls.map(([payload]) => payload.data),
        ...db.models.customerRequirement.createMany.mock.calls.flatMap(([payload]) => payload.data),
    ];
}

beforeEach(() => {
    vi.clearAllMocks();
    db.access.mockResolvedValue(actor('MENTOR', 'EDITOR'));
    db.transaction.mockImplementation(async callback => callback(db.models));
    db.state.requirements = [{
        id: 'existing', projectId, category: '기존 1차 그룹', subcategory: '기존 2차 그룹', requirement: '기존 요구사항',
        kanoPositiveQ: '저장한 긍정 문항', kanoNegativeQ: '저장한 부정 문항', kanoWeight: 2.5, order: 0,
    }];
    db.state.removedIds = [];
});

describe('기존 요구사항 내용 편집과 Kano 가중치 보호', () => {
    it.each(cases)('%s + %s에서 가중치 수정 허용 %s와 제출값 %s를 구분한다', async (systemRole, projectRole, canEditWeight, weight) => {
        db.access.mockResolvedValue(actor(systemRole, projectRole));
        const submitted = row('existing', weight);
        const response = await POST(request([submitted]), params);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, count: 1, revision: expect.any(String) });
        expect(db.access).toHaveBeenCalledWith(expect.any(NextRequest), projectId, { write: true });
        expect(db.models.customerRequirement.updateMany).toHaveBeenCalledExactlyOnceWith({
            where: { id: 'existing', projectId },
            data: {
                category: submitted.category, subcategory: submitted.subcategory, requirement: submitted.requirement,
                kanoPositiveQ: undefined, kanoNegativeQ: undefined, kanoWeight: canEditWeight ? weight : undefined, order: 0,
            },
        });
        expect(db.state.requirements).toEqual([{
            ...submitted, projectId, kanoPositiveQ: '저장한 긍정 문항', kanoNegativeQ: '저장한 부정 문항',
            kanoWeight: canEditWeight ? weight : 2.5,
        }]);
        expect(db.state.removedIds).toEqual([]);
        expect(createdPayloads()).toEqual([]);
    });
});

describe('새 요구사항 생성과 Kano 가중치 보호', () => {
    it.each(cases)('%s + %s가 새 행에 가중치 수정 허용 %s와 제출값 %s를 적용한다', async (systemRole, projectRole, canEditWeight, weight) => {
        db.access.mockResolvedValue(actor(systemRole, projectRole));
        const submitted = row('new', weight);
        const otherWeight = weight === null ? 7 : null;
        const otherSubmitted = row('new-other', otherWeight);
        const response = await POST(request([row(), submitted, otherSubmitted]), params);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, count: 3, revision: expect.any(String) });
        const expectedNewRows = [submitted, otherSubmitted].map((item, index) => ({
            id: item.id, projectId, category: item.category, subcategory: item.subcategory, requirement: item.requirement,
            kanoPositiveQ: undefined, kanoNegativeQ: undefined, kanoWeight: canEditWeight ? item.kanoWeight : undefined, order: index + 1,
        }));
        expect(createdPayloads()).toStrictEqual(expectedNewRows);
        const expectedWrites = [row(), ...expectedNewRows];
        for (const [payload] of db.models.customerRequirement.updateMany.mock.calls) {
            const item = expectedWrites.find(entry => entry.id === payload.where.id)!;
            expect(payload).toStrictEqual({
                where: { id: item.id, projectId },
                data: {
                    category: item.category, subcategory: item.subcategory, requirement: item.requirement,
                    kanoPositiveQ: undefined, kanoNegativeQ: undefined, kanoWeight: item.kanoWeight, order: item.order,
                },
            });
        }
        expect(db.models.customerRequirement.updateMany.mock.calls.filter(([payload]) => payload.where.id === 'existing')).toHaveLength(1);
        expect(db.state.requirements.filter(item => item.id !== 'existing')).toEqual(expectedNewRows.map(item => ({
            ...item, kanoPositiveQ: null, kanoNegativeQ: null, kanoWeight: item.kanoWeight ?? null,
        })));
        expect(db.state.requirements.find(item => item.id === 'existing')).toMatchObject({ requirement: 'existing 수정한 요구사항', kanoWeight: 2.5 });
        expect(db.state.removedIds).toEqual([]);
    });
});

it.each([['MENTEE', 'OWNER'], ['MENTOR', 'EDITOR'], ['ADMIN', 'ADMIN']] as Array<[MemberRole, ProjectAccessRole]>)('%s + %s가 가중치를 생략하면 기존 값을 유지한다', async (systemRole, projectRole) => {
    db.access.mockResolvedValue(actor(systemRole, projectRole));
    expect((await POST(request([row()]), params)).status).toBe(200);
    expect(db.models.customerRequirement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ requirement: 'existing 수정한 요구사항', kanoWeight: undefined }),
    }));
    expect(db.state.requirements[0].kanoWeight).toBe(2.5);
});

it('일반 프로젝트 수정 권한에서 먼저 거부하면 가중치와 요구사항을 모두 쓰지 않는다', async () => {
    const denied = NextResponse.json({ error: '읽기 전용 프로젝트입니다.' }, { status: 403 });
    db.access.mockResolvedValue(denied);
    const before = structuredClone(db.state);
    expect(await POST(request([row('existing', 9)]), params)).toBe(denied);
    expect(db.models.customerRequirement.count).not.toHaveBeenCalled();
    expect(db.models.customerRequirement.findMany).not.toHaveBeenCalled();
    expect(db.models.customerRequirement.updateMany).not.toHaveBeenCalled();
    expect(db.models.customerRequirement.create).not.toHaveBeenCalled();
    expect(db.models.customerRequirement.createMany).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.state).toEqual(before);
});
