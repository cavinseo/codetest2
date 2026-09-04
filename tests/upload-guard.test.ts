import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, checkUploadedExcel, guardUploadedExcel } from '../lib/upload-guard';
import { checkUploadedFile, guardUploadedFile, type UploadFileRule } from '../lib/upload-guard';

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

const answerFileRule: UploadFileRule = {
    extensions: ['.html', '.htm', '.json'],
    maxBytes: 400 * 1024,
    label: '답변',
};

describe('checkUploadedFile', () => {
    it('허용된 HTML 과 JSON 확장자를 대소문자와 복합 확장자까지 받는다', () => {
        expect(checkUploadedFile(fileOf('a.html', 100), answerFileRule)).toBeNull();
        expect(checkUploadedFile(fileOf('A.HTM', 100), answerFileRule)).toBeNull();
        expect(checkUploadedFile(fileOf('b.json', 100), answerFileRule)).toBeNull();
        expect(checkUploadedFile(fileOf('c.kano.json', 100), answerFileRule)).toBeNull();
    });

    it('허용되지 않은 확장자에 전체 허용 목록을 안내한다', () => {
        const result = checkUploadedFile(fileOf('note.txt', 100), answerFileRule);

        expect(result?.status).toBe(400);
        expect(result?.error).toContain('.html 또는 .htm 또는 .json');
    });

    it('400KB 상한을 넘으면 막고 상한과 같으면 허용한다', () => {
        const result = checkUploadedFile(fileOf('large.html', (400 * 1024) + 1), answerFileRule);

        expect(result?.status).toBe(413);
        expect(result?.error).toContain('400KB');
        expect(checkUploadedFile(fileOf('edge.html', 400 * 1024), answerFileRule)).toBeNull();
    });

    it('빈 파일 오류에 답변 파일임을 안내한다', () => {
        expect(checkUploadedFile(fileOf('empty.html', 0), answerFileRule)?.error).toContain('답변');
    });

    it('파일이 아닌 값의 오류에 답변 파일임을 안내한다', () => {
        expect(checkUploadedFile(null, answerFileRule)?.error).toContain('답변');
    });

    it('guard 성공 시 같은 File 을 돌려준다', () => {
        const file = fileOf('answer.html', 100);
        const result = guardUploadedFile(file, answerFileRule);

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.file).toBe(file);
    });

    it('guard 실패 시 검사 결과의 상태를 돌려준다', () => {
        const result = guardUploadedFile(fileOf('answer.txt', 100), answerFileRule);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.status).toBe(400);
    });
});
