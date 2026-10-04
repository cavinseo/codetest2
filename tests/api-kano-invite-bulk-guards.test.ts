// Kano 대량 초대에서 엑셀 크기와 압축 파일 안전 검사를 파싱 전에 적용한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ access: vi.fn(), projectFind: vi.fn(), parseWorkbook: vi.fn() }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: mocks.access }));
vi.mock('../lib/prisma', () => ({ prisma: { project: { findUnique: mocks.projectFind } } }));
vi.mock('../lib/email', () => ({ sendSurveyInvitation: vi.fn() }));
vi.mock('../lib/kano-invite-template', () => ({
    parseInviteEmailText: vi.fn(), parseKanoInviteWorkbook: mocks.parseWorkbook,
}));

const { POST } = await import('../app/api/projects/[id]/kano/invite/bulk/route');
const params = { params: Promise.resolve({ id: 'project-1' }) };

function uploadRequest(file: File) {
    const form = new FormData();
    form.set('file', file);
    return new NextRequest('http://localhost/api/projects/project-1/kano/invite/bulk', { method: 'POST', body: form });
}

function compressionBombXlsx() {
    const name = new TextEncoder().encode('xl/worksheets/sheet1.xml');
    const directorySize = 46 + name.length;
    const bytes = new Uint8Array(directorySize + 22);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint32(20, 1, true);
    view.setUint32(24, 50 * 1024 * 1024 + 1, true);
    view.setUint16(28, name.length, true);
    bytes.set(name, 46);
    const end = directorySize;
    view.setUint32(end, 0x06054b50, true);
    view.setUint16(end + 8, 1, true);
    view.setUint16(end + 10, 1, true);
    view.setUint32(end + 12, directorySize, true);
    return bytes;
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ user: { userId: 'owner-1' } });
    mocks.projectFind.mockResolvedValue({ name: '프로젝트' });
});

it('엑셀 크기 상한을 넘으면 파싱 전에 413으로 거절한다', async () => {
    const response = await POST(uploadRequest(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.xlsx')), params);

    expect(response.status).toBe(413);
    expect(mocks.parseWorkbook).not.toHaveBeenCalled();
});

it('압축 해제 용량이 위험한 xlsx는 파싱 전에 413으로 거절한다', async () => {
    const response = await POST(uploadRequest(new File([compressionBombXlsx()], 'bomb.xlsx')), params);

    expect(response.status).toBe(413);
    expect(mocks.parseWorkbook).not.toHaveBeenCalled();
});
