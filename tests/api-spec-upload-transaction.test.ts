// WS-2 엑셀 업로드가 삭제와 재생성을 한 트랜잭션으로 묶는지 확인한다.
//
// 예전 구조는 deleteMany 를 먼저 커밋한 뒤 개별 create 루프를 돌았다. 루프 중간에
// 실패하면 기존 스펙은 이미 사라지고 새 데이터는 일부만 남아 롤백이 불가능했다.
// 여기서는 실제 xlsx 를 만들어 POST 를 태우고, 모든 쓰기가 트랜잭션 클라이언트로만
// 나가는지 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const tx = {
    specFunction: {
        aggregate: vi.fn(async () => ({ _max: { order: null } })),
        deleteMany: vi.fn(),
        create: vi.fn(async () => ({ id: `spec_${Math.random().toString(36).slice(2)}` })),
        findMany: vi.fn(async () => []),
    },
};

// 라우트가 트랜잭션 밖에서 직접 쓰면 잡아내기 위해, prisma 쪽 specFunction 에도
// 같은 이름의 목을 달아 두고 "호출되지 않았음"을 단언한다.
const bareSpecFunction = {
    aggregate: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
};

let transactionOptions: unknown;

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: vi.fn(async () => ({ id: 'project_1', name: '테스트' })) },
        specFunction: bareSpecFunction,
        $transaction: vi.fn(async (fn: (client: typeof tx) => unknown, options: unknown) => {
            transactionOptions = options;
            return fn(tx);
        }),
    },
}));

const requireProjectAccess = vi.fn(async () => ({
    user: { userId: 'user_1', email: 'a@b.com', name: null },
    role: 'OWNER' as const,
}));
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST } = await import('../app/api/projects/[id]/spec/upload-excel/route');

const params = { params: Promise.resolve({ id: 'project_1' }) };

function specWorkbookFile(): File {
    const rows = [
        ['핵심기능', '세부기능', '세세부기능', '적용기술'],
        ['회원 관리', '명부 관리', '중복 검출', '문자열 정규화'],
        ['회원 관리', '회비 관리', '미납 집계', '배치 집계'],
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'AS-IS 스펙표');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new File([new Uint8Array(buffer)], 'spec.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

function uploadRequest(writePolicy: string): NextRequest {
    const form = new FormData();
    form.append('file', specWorkbookFile());
    form.append('writePolicy', writePolicy);
    return new NextRequest('http://localhost/api/projects/project_1/spec/upload-excel', {
        method: 'POST',
        body: form,
    });
}

beforeEach(() => {
    transactionOptions = undefined;
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'a@b.com', name: null },
        role: 'OWNER',
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('spec upload-excel POST', () => {
    it('replace 정책에서 삭제와 생성이 같은 트랜잭션 클라이언트로 나간다', async () => {
        const res = await POST(uploadRequest('replace'), params);

        expect(res.status).toBe(200);
        expect(tx.specFunction.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'project_1' } });
        expect(tx.specFunction.create).toHaveBeenCalled();

        // 트랜잭션 밖으로 새는 쓰기가 없어야 한다.
        expect(bareSpecFunction.deleteMany).not.toHaveBeenCalled();
        expect(bareSpecFunction.create).not.toHaveBeenCalled();
        expect(bareSpecFunction.aggregate).not.toHaveBeenCalled();
    });

    it('append 정책은 기존 행을 지우지 않는다', async () => {
        const res = await POST(uploadRequest('append'), params);

        expect(res.status).toBe(200);
        expect(tx.specFunction.deleteMany).not.toHaveBeenCalled();
        expect(tx.specFunction.aggregate).toHaveBeenCalled();
        expect(tx.specFunction.create).toHaveBeenCalled();
    });

    it('행이 많은 파일을 위해 트랜잭션 timeout 을 지정한다', async () => {
        await POST(uploadRequest('replace'), params);

        expect(transactionOptions).toMatchObject({ timeout: expect.any(Number) });
    });

    it('권한이 없으면 403 이고 아무것도 지우지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(
            NextResponse.json({ error: 'forbidden' }, { status: 403 }) as never
        );

        const res = await POST(uploadRequest('replace'), params);

        expect(res.status).toBe(403);
        expect(tx.specFunction.deleteMany).not.toHaveBeenCalled();
        expect(bareSpecFunction.deleteMany).not.toHaveBeenCalled();
    });
});
