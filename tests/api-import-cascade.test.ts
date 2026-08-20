// 엑셀 import 의 replace 정책이 Kano 설문 응답을 말없이 지우지 않는지 확인한다.
//
// 고객요구사항 삭제는 스키마상 KanoResponse/Benchmark/QFDMatrix 를 캐스케이드로
// 함께 지운다. 설문 응답은 재수집이 불가능하므로, 사용자가 확인하기 전에는
// apply 가 진행되면 안 된다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const counts = { kano: 0, benchmark: 0, qfd: 0 };

const tx = new Proxy({} as Record<string, Record<string, ReturnType<typeof vi.fn>>>, {
    get(target, model: string) {
        if (!target[model]) {
            target[model] = {
                deleteMany: vi.fn(),
                createMany: vi.fn(),
                create: vi.fn(async () => ({ id: 'row_1' })),
                findMany: vi.fn(async () => []),
            };
        }
        return target[model];
    },
});

vi.mock('../lib/prisma', () => ({
    prisma: {
        kanoResponse: { count: vi.fn(async () => counts.kano) },
        benchmark: { count: vi.fn(async () => counts.benchmark) },
        qFDMatrix: { count: vi.fn(async () => counts.qfd) },
        $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    },
}));

const requireProjectAccess = vi.fn(async () => ({
    user: { userId: 'user_1', email: 'a@b.com', name: null },
    role: 'OWNER' as const,
}));
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST } = await import('../app/api/projects/[id]/import/route');

const params = { params: Promise.resolve({ id: 'project_1' }) };

// 고객요구사항 시트가 인식되도록 실제 워크북을 만든다.
function requirementsWorkbookFile(): File {
    // parseRequirements 는 1차/2차/항목 헤더를 찾는다.
    const rows = [
        ['1차 분류', '2차 분류', '항목'],
        ['기능', '회원관리', '회비 미납자를 자동으로 알려줄 것'],
        ['기능', '일정관리', '정기 모임 일정을 공유할 것'],
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '고객요구사항도출표');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new File([new Uint8Array(buffer)], 'requirements.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

function importRequest(fields: Record<string, string>): NextRequest {
    const form = new FormData();
    form.append('file', requirementsWorkbookFile());
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return new NextRequest('http://localhost/api/projects/project_1/import', {
        method: 'POST',
        body: form,
    });
}

beforeEach(() => {
    counts.kano = 0;
    counts.benchmark = 0;
    counts.qfd = 0;
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'a@b.com', name: null },
        role: 'OWNER',
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('import POST — 캐스케이드 가드', () => {
    it('설문 응답이 있는데 확인하지 않으면 409 로 막고 아무것도 지우지 않는다', async () => {
        counts.kano = 37;

        const res = await POST(importRequest({ action: 'apply', writePolicy: 'replace' }), params);
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.cascadeImpact.kanoResponses).toBe(37);
        expect(body.error).toContain('Kano 설문 응답 37건');
        expect(tx.customerRequirement.deleteMany).not.toHaveBeenCalled();
    });

    it('사용자가 확인하면 진행한다', async () => {
        counts.kano = 37;

        const res = await POST(
            importRequest({ action: 'apply', writePolicy: 'replace', confirmCascade: 'true' }),
            params
        );

        expect(res.status).toBe(200);
        expect(tx.customerRequirement.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'project_1' } });
    });

    it('지워질 부수 데이터가 없으면 확인 없이 진행한다', async () => {
        const res = await POST(importRequest({ action: 'apply', writePolicy: 'replace' }), params);

        expect(res.status).toBe(200);
        expect(tx.customerRequirement.deleteMany).toHaveBeenCalled();
    });

    it('append 정책은 캐스케이드가 없으므로 막지 않는다', async () => {
        counts.kano = 37;

        const res = await POST(importRequest({ action: 'apply', writePolicy: 'append' }), params);

        expect(res.status).toBe(200);
        expect(tx.customerRequirement.deleteMany).not.toHaveBeenCalled();
    });

    it('preview 는 막지 않고, 무엇이 지워지는지 미리 알려준다', async () => {
        counts.kano = 37;
        counts.qfd = 5;

        const res = await POST(importRequest({ action: 'preview', writePolicy: 'replace' }), params);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.applied).toBe(false);
        expect(body.cascadeWarning).toContain('Kano 설문 응답 37건');
        expect(body.cascadeWarning).toContain('QFD 관계 5건');
        expect(tx.customerRequirement.deleteMany).not.toHaveBeenCalled();
    });

    it('권한이 없으면 403 이고 아무것도 지우지 않는다', async () => {
        counts.kano = 37;
        requireProjectAccess.mockResolvedValue(
            NextResponse.json({ error: 'forbidden' }, { status: 403 }) as never
        );

        const res = await POST(
            importRequest({ action: 'apply', writePolicy: 'replace', confirmCascade: 'true' }),
            params
        );

        expect(res.status).toBe(403);
        expect(tx.customerRequirement.deleteMany).not.toHaveBeenCalled();
    });
});
