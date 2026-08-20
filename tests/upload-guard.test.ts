import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, checkUploadedExcel, guardUploadedExcel } from '../lib/upload-guard';

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
