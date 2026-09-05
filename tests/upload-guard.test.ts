import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, checkUploadedExcel, guardUploadedExcel } from '../lib/upload-guard';
import {
    MAX_OFFLINE_HTML_BYTES,
    MAX_OFFLINE_HTML_FILES,
    guardUploadedOfflineHtml,
} from '../lib/upload-guard';

function fileOf(name: string, size: number): File {
    return new File([new Uint8Array(size)], name, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

describe('checkUploadedExcel', () => {
    it('정상 xlsx 는 통과시킨다', () => {
        expect(checkUploadedExcel(fileOf('data.xlsx', 1024))).toBeNull();
        expect(checkUploadedExcel(fileOf('data.XLS', 1024))).toBeNull();
    });

    it('파일이 아니면 막는다', () => {
        expect(checkUploadedExcel(null)?.status).toBe(400);
        expect(checkUploadedExcel('not-a-file')?.status).toBe(400);
    });

    it('빈 파일을 막는다', () => {
        expect(checkUploadedExcel(fileOf('empty.xlsx', 0))?.error).toContain('빈 파일');
    });

    it('크기 상한을 넘으면 413 으로 막는다', () => {
        const result = checkUploadedExcel(fileOf('huge.xlsx', MAX_UPLOAD_BYTES + 1));

        expect(result?.status).toBe(413);
        expect(result?.error).toContain('10MB');
    });

    it('상한과 같은 크기는 허용한다', () => {
        expect(checkUploadedExcel(fileOf('edge.xlsx', MAX_UPLOAD_BYTES))).toBeNull();
    });

    it('엑셀이 아닌 확장자를 막는다', () => {
        expect(checkUploadedExcel(fileOf('payload.zip', 100))?.error).toContain('.xlsx');
        expect(checkUploadedExcel(fileOf('noext', 100))?.status).toBe(400);
    });
});

describe('guardUploadedExcel', () => {
    it('성공하면 File 을 그대로 돌려준다', () => {
        const file = fileOf('ok.xlsx', 10);
        const result = guardUploadedExcel(file);

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.file).toBe(file);
    });

    it('실패하면 사유를 돌려준다', () => {
        const result = guardUploadedExcel(fileOf('big.xlsx', MAX_UPLOAD_BYTES + 1));

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.status).toBe(413);
    });
});

function offlineHtmlFileOf(name: string, size: number): File {
    return new File([new Uint8Array(size)], name, { type: 'text/html' });
}

describe('guardUploadedOfflineHtml', () => {
    it('오프라인 HTML 한도 상수를 고정한다', () => {
        expect(MAX_OFFLINE_HTML_BYTES).toBe(2 * 1024 * 1024);
        expect(MAX_OFFLINE_HTML_FILES).toBe(100);
    });

    it('html과 htm 파일 및 정확한 크기 상한을 허용한다', () => {
        const html = offlineHtmlFileOf('response.html', MAX_OFFLINE_HTML_BYTES);
        const htm = offlineHtmlFileOf('response.HTM', 1);
        const htmlResult = guardUploadedOfflineHtml(html);
        const htmResult = guardUploadedOfflineHtml(htm);

        expect(htmlResult.ok).toBe(true);
        if (htmlResult.ok) expect(htmlResult.file).toBe(html);
        expect(htmResult.ok).toBe(true);
        if (htmResult.ok) expect(htmResult.file).toBe(htm);
    });

    it('파일이 아니면 승인된 400 오류를 돌려준다', () => {
        expect(guardUploadedOfflineHtml(null)).toEqual({
            ok: false,
            failure: { error: '업로드할 HTML 응답지가 필요합니다.', status: 400 },
        });
    });

    it('빈 파일이면 승인된 400 오류를 돌려준다', () => {
        expect(guardUploadedOfflineHtml(offlineHtmlFileOf('empty.html', 0))).toEqual({
            ok: false,
            failure: { error: '빈 파일입니다. 내용이 있는 HTML 응답지를 올려 주세요.', status: 400 },
        });
    });

    it('2MB를 초과하면 승인된 413 오류를 돌려준다', () => {
        expect(guardUploadedOfflineHtml(
            offlineHtmlFileOf('large.html', MAX_OFFLINE_HTML_BYTES + 1)
        )).toEqual({
            ok: false,
            failure: { error: 'HTML 응답지 하나는 2MB를 초과할 수 없습니다.', status: 413 },
        });
    });

    it('지원하지 않는 확장자면 승인된 400 오류를 돌려준다', () => {
        expect(guardUploadedOfflineHtml(offlineHtmlFileOf('response.txt', 1))).toEqual({
            ok: false,
            failure: { error: '.html 또는 .htm 파일만 업로드할 수 있습니다.', status: 400 },
        });
    });

    it('여러 조건이 실패하면 빈 파일과 크기 오류를 확장자보다 먼저 돌려준다', () => {
        expect(guardUploadedOfflineHtml(offlineHtmlFileOf('empty.txt', 0))).toEqual({
            ok: false,
            failure: { error: '빈 파일입니다. 내용이 있는 HTML 응답지를 올려 주세요.', status: 400 },
        });
        expect(guardUploadedOfflineHtml(
            offlineHtmlFileOf('large.txt', MAX_OFFLINE_HTML_BYTES + 1)
        )).toEqual({
            ok: false,
            failure: { error: 'HTML 응답지 하나는 2MB를 초과할 수 없습니다.', status: 413 },
        });
    });
});
