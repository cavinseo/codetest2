// AS-IS 스펙표(WS-2) 저장 라우트의 회귀 테스트.
//
// 이 라우트는 여기까지 라우트 테스트가 한 건도 없었고, 그 사이 두 결함을 안고 있었다.
//   1) 빈 배열에 조기 반환이 있어, 화면의 초기화 버튼이 DB 를 지우지 못했다.
//      200 과 "초기화되었습니다" 토스트가 나가는데 새로고침하면 전부 되살아났다.
//   2) 저장소에서 유일하게 zod 검증이 없어, body.specFunctions || [] 가 잘못된 본문을
//      조용히 [] 로 강등시켰다. 1)을 고치면 그 강등이 곧 전량 삭제가 된다.
// 두 가지를 함께 고정한다 — 하나만 지키면 다른 하나가 더 나쁜 결함이 된다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const tx = {
    specFunction: {
        deleteMany: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(async () => []),
    },
};

const findProject = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: (...args: unknown[]) => findProject(...(args as [])) },
        $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST } = await import('../app/api/projects/[id]/spec/route');

const params = { params: Promise.resolve({ id: 'project_1' }) };

function post(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/project_1/spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// serializeSpecs 가 실제로 만들어 보내는 형태다(임시 id + 임시 parentId).
const coreRow = { id: 'core_0', level: 'CORE', name: '핵심기능', order: 0 };
const subRow = { id: 'sub_1', level: 'SUB', parentId: 'core_0', name: '세부기능', order: 1 };
const detailRow = { id: 'detail_2', level: 'DETAIL', parentId: 'sub_1', name: '세세부기능', technology: '기술', order: 2 };

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'a@b.com', name: null },
        role: 'OWNER',
    });
    findProject.mockResolvedValue({ id: 'project_1' });
    // 생성된 행마다 실제 cuid 를 흉내 낸 id 를 돌려준다. parentId 재매핑을 보려면
    // 임시 id 와 다른 값이어야 한다.
    let created = 0;
    tx.specFunction.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: `cuid_${created++}`,
    }));
    tx.specFunction.findMany.mockResolvedValue([]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('스펙 저장 — 초기화가 실제로 지운다', () => {
    it('빈 배열을 보내면 deleteMany 가 실행된다', async () => {
        const res = await POST(post({ specFunctions: [] }), params);

        expect(res.status).toBe(200);
        expect(tx.specFunction.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'project_1' } });
        expect(tx.specFunction.create).not.toHaveBeenCalled();
    });

    it('빈 배열 응답은 200 이고 specFunctions 가 비어 있다', async () => {
        const res = await POST(post({ specFunctions: [] }), params);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.specFunctions).toEqual([]);
    });
});

describe('스펙 저장 — 잘못된 본문은 아무것도 지우지 않는다', () => {
    it('specFunctions 가 배열이 아니면 400 이고 deleteMany 를 부르지 않는다', async () => {
        const res = await POST(post({ specFunctions: 'CORE' }), params);

        expect(res.status).toBe(400);
        expect(tx.specFunction.deleteMany).not.toHaveBeenCalled();
    });

    it('specFunctions 키가 없으면 400 이고 deleteMany 를 부르지 않는다', async () => {
        const res = await POST(post({ specFuntcions: [coreRow] }), params);

        expect(res.status).toBe(400);
        expect(tx.specFunction.deleteMany).not.toHaveBeenCalled();
    });

    it('level 이 화이트리스트 밖이면 400 이다', async () => {
        const res = await POST(post({ specFunctions: [{ ...coreRow, level: 'ROOT' }] }), params);

        expect(res.status).toBe(400);
        expect(tx.specFunction.deleteMany).not.toHaveBeenCalled();
    });

    it('name 이 빈 문자열이면 400 이다', async () => {
        const res = await POST(post({ specFunctions: [{ ...coreRow, name: '   ' }] }), params);

        expect(res.status).toBe(400);
        expect(tx.specFunction.deleteMany).not.toHaveBeenCalled();
    });

    it('행수 상한을 넘으면 400 이다', async () => {
        const rows = Array.from({ length: 2001 }, (_, index) => ({ ...coreRow, id: `core_${index}`, order: index }));
        const res = await POST(post({ specFunctions: rows }), params);

        expect(res.status).toBe(400);
        expect(tx.specFunction.deleteMany).not.toHaveBeenCalled();
    });

    it('검증 실패 응답은 어느 항목이 문제인지 알려준다', async () => {
        const res = await POST(post({ specFunctions: [{ ...coreRow, level: 'ROOT' }] }), params);
        const data = await res.json();

        // 고정 문구로 뭉개면 사용자는 저장이 왜 막혔는지 알 수 없다.
        expect(typeof data.error).toBe('string');
        expect(data.error.length).toBeGreaterThan(0);
        expect(data.error).not.toBe('스펙 저장에 실패했습니다.');
    });
});

describe('스펙 저장 — 계층 재매핑', () => {
    it('CORE → SUB → DETAIL 순으로 저장하고 parentId 를 실제 id 로 바꾼다', async () => {
        // 일부러 뒤섞어 보내, 라우트가 순서를 스스로 세우는지 본다.
        const res = await POST(post({ specFunctions: [detailRow, subRow, coreRow] }), params);

        expect(res.status).toBe(200);
        const levels = tx.specFunction.create.mock.calls.map(([{ data }]) => data.level);
        expect(levels).toEqual(['CORE', 'SUB', 'DETAIL']);

        const [, [{ data: subData }], [{ data: detailData }]] = tx.specFunction.create.mock.calls;
        expect(subData.parentId).toBe('cuid_0');
        expect(detailData.parentId).toBe('cuid_1');
    });

    it('임시 id 는 저장하지 않는다', async () => {
        await POST(post({ specFunctions: [coreRow] }), params);

        const [{ data }] = tx.specFunction.create.mock.calls[0];
        expect(data).not.toHaveProperty('id');
        expect(data.projectId).toBe('project_1');
    });

    it('클라이언트가 보낸 임의 필드는 저장되지 않는다', async () => {
        await POST(post({ specFunctions: [{ ...coreRow, projectId: 'other_project', bogus: 1 }] }), params);

        const [{ data }] = tx.specFunction.create.mock.calls[0];
        expect(data.projectId).toBe('project_1');
        expect(data).not.toHaveProperty('bogus');
    });
});

describe('스펙 저장 — 접근 제어', () => {
    it('권한이 없으면 403 이고 아무것도 지우지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(
            NextResponse.json({ error: 'forbidden' }, { status: 403 }) as never
        );

        const res = await POST(post({ specFunctions: [] }), params);

        expect(res.status).toBe(403);
        expect(tx.specFunction.deleteMany).not.toHaveBeenCalled();
    });

    it('프로젝트가 없으면 404 이고 아무것도 지우지 않는다', async () => {
        findProject.mockResolvedValue(null);

        const res = await POST(post({ specFunctions: [] }), params);

        expect(res.status).toBe(404);
        expect(tx.specFunction.deleteMany).not.toHaveBeenCalled();
    });
});
