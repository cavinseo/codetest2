// 결과보고서 .docx 직렬화 라우트가 권한을 확인하고, 모델을 그대로 넘겨 첨부로 내려주는지 검사한다.
// 직렬화 자체(블록별 렌더링)는 lib/final-report-docx.ts 쪽 tests/final-report-docx.test.ts 가 맡는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const renderFinalReportDocx = vi.fn();
vi.mock('../lib/final-report-docx', () => ({
    renderFinalReportDocx: (...args: unknown[]) => renderFinalReportDocx(...(args as [])),
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST } = await import('../app/api/projects/[id]/report/docx/route');

const USER = { userId: 'user_1', email: 'owner@x.com', name: '소유자' };
const MODEL = { title: '결과보고서', fileName: '결과보고서_스마트팜.docx', blocks: [{ kind: 'paragraph', text: '본문' }] };

function call(body: unknown = MODEL, projectId = 'proj_1') {
    const request = new NextRequest(`http://localhost/api/projects/${projectId}/report/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return POST(request, { params: Promise.resolve({ id: projectId }) });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    renderFinalReportDocx.mockResolvedValue(new Blob(['PK\x03\x04dummy'], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }));
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/projects/[id]/report/docx', () => {
    it('.docx 첨부 파일로 내려준다', async () => {
        const res = await call();

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        expect(res.headers.get('Content-Disposition')).toBe(
            `attachment; filename*=UTF-8''${encodeURIComponent('결과보고서_스마트팜.docx')}`
        );
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(renderFinalReportDocx).toHaveBeenCalledWith(MODEL);
    });

    it('권한이 없으면 접근 판정 결과를 그대로 돌려주고 문서를 만들지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(NextResponse.json({ error: 'denied' }, { status: 403 }));

        const res = await call();

        expect(res.status).toBe(403);
        expect(renderFinalReportDocx).not.toHaveBeenCalled();
    });

    it('fileName 이 없으면 400 으로 막는다', async () => {
        const res = await call({ title: '결과보고서', blocks: [] });

        expect(res.status).toBe(400);
        expect(renderFinalReportDocx).not.toHaveBeenCalled();
    });

    it('blocks 가 배열이 아니면 400 으로 막는다', async () => {
        const res = await call({ ...MODEL, blocks: 'oops' });

        expect(res.status).toBe(400);
        expect(renderFinalReportDocx).not.toHaveBeenCalled();
    });

    it('문서 생성이 실패하면 500 이고 원인을 응답에 담지 않는다', async () => {
        renderFinalReportDocx.mockRejectedValue(new Error('docx internal error at line 15115'));

        const res = await call();
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body.error).toBe('문서 생성에 실패했습니다.');
        expect(JSON.stringify(body)).not.toContain('line 15115');
    });
});
