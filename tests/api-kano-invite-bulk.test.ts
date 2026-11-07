// Kano 일괄 초대가 업로드 파일 크기·확장자를 검사하고, 내부 오류 문구를 화면에 내보내지 않는지 확인한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findProject = vi.fn();
const findInvitations = vi.fn();
const createInvitation = vi.fn();
const parseWorkbook = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: findProject },
        kanoSurveyInvitation: { findMany: findInvitations, create: createInvitation },
    },
}));
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: vi.fn(async () => ({ user: { userId: 'editor_1' }, role: 'EDITOR' })),
}));
vi.mock('../lib/email', () => ({ sendSurveyInvitation: vi.fn(async () => false) }));
vi.mock('../lib/kano-invite-template', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/kano-invite-template')>()),
    parseKanoInviteWorkbook: (...args: unknown[]) => parseWorkbook(...args),
}));

const { POST } = await import('../app/api/projects/[id]/kano/invite/bulk/route');
const params = { params: Promise.resolve({ id: 'proj_1' }) };

function uploadRequest(file: File) {
    const form = new FormData();
    form.append('file', file);
    return new NextRequest('http://localhost/api/projects/proj_1/kano/invite/bulk', { method: 'POST', body: form });
}

function textRequest(text: string) {
    return new NextRequest('http://localhost/api/projects/proj_1/kano/invite/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
}

beforeEach(() => {
    findProject.mockResolvedValue({ name: '프로젝트' });
    findInvitations.mockResolvedValue([]);
    createInvitation.mockResolvedValue({});
    parseWorkbook.mockReturnValue({ rows: [{ email: 'a@x.com', name: '' }], skipped: [] });
});

afterEach(() => {
    vi.clearAllMocks();
});

it('10MB 를 넘는 명단 파일은 읽기 전에 413 으로 거부한다', async () => {
    const res = await POST(uploadRequest(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'list.xlsx')), params);

    expect(res.status).toBe(413);
    expect(parseWorkbook).not.toHaveBeenCalled();
});

it('엑셀이 아닌 파일은 400 으로 거부한다', async () => {
    const res = await POST(uploadRequest(new File(['a@x.com'], 'list.txt')), params);

    expect(res.status).toBe(400);
    expect(parseWorkbook).not.toHaveBeenCalled();
});

it('읽을 수 없는 엑셀은 파서 오류 대신 안내 문구로 400 을 준다', async () => {
    parseWorkbook.mockImplementation(() => { throw new Error('Unsupported ZIP Compression method NaN'); });

    const res = await POST(uploadRequest(new File(['broken'], 'list.xlsx')), params);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).not.toContain('ZIP');
});

it('DB 오류는 내부 문구를 숨기고 500 으로 응답한다', async () => {
    findInvitations.mockRejectedValue(new Error('Invalid `prisma.kanoSurveyInvitation.findMany()` invocation: relation "kano_survey_invitations" does not exist'));

    const res = await POST(textRequest('a@x.com'), params);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('일괄 초대에 실패했습니다. 잠시 후 다시 시도하세요.');
});

it('명단이 비어 있으면 안내 문구로 400 을 준다', async () => {
    const res = await POST(new NextRequest('http://localhost/api/projects/proj_1/kano/invite/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }), params);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('초대할 이메일 주소가 없습니다.');
});

it('정상 업로드는 초대를 만든다', async () => {
    const res = await POST(uploadRequest(new File(['xlsx'], 'list.xlsx')), params);

    expect(res.status).toBe(200);
    expect(createInvitation).toHaveBeenCalledTimes(1);
});
