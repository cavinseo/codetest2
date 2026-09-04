// 오프라인 응답 업로드 화면의 파일 판정과 배치 계산 계약을 검증한다.
import { describe, expect, it } from 'vitest';
import { KANO_OFFLINE_FORMAT } from '../lib/kano-offline-survey';
import {
    KANO_OFFLINE_FORMAT_NAME,
    KANO_OFFLINE_UPLOAD_BATCH,
    absoluteFileIndex,
    chunkKanoOfflineFiles,
    inspectKanoOfflineFileText,
} from '../lib/kano-offline-upload-client';

const PROJECT_ID = 'proj_1';

function payload(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        format: KANO_OFFLINE_FORMAT_NAME,
        projectId: PROJECT_ID,
        ...overrides,
    });
}

function responseIsland(content: string): string {
    return `<script type="application/json" id="kano-offline-response">${content}</script>`;
}

describe('inspectKanoOfflineFileText', () => {
    it('정상 JSON을 오프라인 답변 파일로 판정한다', () => {
        expect(inspectKanoOfflineFileText(payload(), PROJECT_ID)).toEqual({ ok: true });
    });

    it.each([
        ['응답 섬이 빈 HTML', `<!DOCTYPE html><html>${responseIsland('')}</html>`],
        ['응답 섬이 없는 HTML', '  \n<!DOCTYPE html><html><body>설문</body></html>'],
    ])('%s은 survey-file로 판정한다', (_name, text) => {
        expect(inspectKanoOfflineFileText(text, PROJECT_ID)).toEqual({
            ok: false,
            reason: 'survey-file',
        });
    });

    it.each([
        ['깨진 JSON', '{broken'],
        ['다른 형식', payload({ format: 'other-format' })],
        ['null', 'null'],
        ['문자열', '"text"'],
        ['배열', '[]'],
    ])('%s은 not-offline-file로 판정한다', (_name, text) => {
        expect(inspectKanoOfflineFileText(text, PROJECT_ID)).toEqual({
            ok: false,
            reason: 'not-offline-file',
        });
    });

    it('다른 프로젝트 답변은 other-project로 판정한다', () => {
        expect(inspectKanoOfflineFileText(payload({ projectId: 'proj_2' }), PROJECT_ID)).toEqual({
            ok: false,
            reason: 'other-project',
        });
    });

    it('응답 섬이 여러 개면 마지막 비어 있지 않은 섬을 쓴다', () => {
        const html = [
            '<!DOCTYPE html><html>',
            responseIsland(payload({ projectId: 'proj_2' })),
            responseIsland('  '),
            responseIsland(payload()),
            responseIsland(' \n '),
            '</html>',
        ].join('');

        expect(inspectKanoOfflineFileText(html, PROJECT_ID)).toEqual({ ok: true });
    });

    it('응답 섬의 이스케이프된 < 문자를 JSON으로 복원해 판정한다', () => {
        const escapedPayload = JSON.stringify({
            format: KANO_OFFLINE_FORMAT_NAME,
            projectId: PROJECT_ID,
            note: '</script>',
        }, null, 2).replace('<', '\\u003c');
        const html = `<!DOCTYPE html><html>${responseIsland(escapedPayload)}</html>`;

        expect(inspectKanoOfflineFileText(html, PROJECT_ID)).toEqual({ ok: true });
    });
});

describe('chunkKanoOfflineFiles', () => {
    it.each([
        [0, []],
        [1, [1]],
        [10, [10]],
        [11, [10, 1]],
        [23, [10, 10, 3]],
    ])('%i개를 기본 크기 10으로 나눈다', (count, expectedLengths) => {
        const files = Array.from({ length: count }, (_, index) => index);
        const chunks = chunkKanoOfflineFiles(files);

        expect(KANO_OFFLINE_UPLOAD_BATCH).toBe(10);
        expect(chunks.map((chunk) => chunk.length)).toEqual(expectedLengths);
        expect(chunks.flat()).toEqual(files);
    });

    it('지정한 배치 크기를 사용한다', () => {
        expect(chunkKanoOfflineFiles([0, 1, 2, 3, 4], 2)).toEqual([[0, 1], [2, 3], [4]]);
    });
});

describe('absoluteFileIndex', () => {
    it.each([
        [0, 0, 0],
        [1, 0, 10],
        [2, 3, 23],
    ])('배치 %i의 내부 인덱스 %i를 절대 인덱스 %i로 바꾼다', (batchIndex, indexInBatch, expected) => {
        expect(absoluteFileIndex(batchIndex, indexInBatch)).toBe(expected);
    });

    it('지정한 배치 크기를 사용한다', () => {
        expect(absoluteFileIndex(2, 1, 4)).toBe(9);
    });
});

it('화면 형식 이름은 서버 형식 이름과 같다', () => {
    expect(KANO_OFFLINE_FORMAT_NAME).toBe(KANO_OFFLINE_FORMAT);
});
