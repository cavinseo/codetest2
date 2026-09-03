// 렌더러가 유효한 .docx(ZIP) 바이너리를 내는지 확인하는 스모크 테스트입니다.
// 문구와 행 규칙은 kano-survey-document.test.ts 가 고정한다.
import { describe, expect, it } from 'vitest';
import { buildKanoSurveyDocumentModel } from '../lib/kano-survey-document';
import { renderKanoSurveyDocx } from '../lib/kano-survey-docx';

describe('renderKanoSurveyDocx', () => {
    it('ZIP 서명으로 시작하는 바이너리를 만든다', async () => {
        const buffer = await renderKanoSurveyDocx(buildKanoSurveyDocumentModel([
            { requirement: '가', kanoPositiveQ: '가-긍정', kanoNegativeQ: '가-부정' },
        ]));
        expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
        expect(buffer.length).toBeGreaterThan(1000);
    });

    it('요구사항이 없어도 만들어진다', async () => {
        const buffer = await renderKanoSurveyDocx(buildKanoSurveyDocumentModel([]));
        expect(buffer.subarray(0, 2).toString()).toBe('PK');
    });

    it('요구사항이 많아도 만들어진다', async () => {
        const many = Array.from({ length: 40 }, (_, i) => ({ requirement: `요구 ${i + 1}` }));
        const buffer = await renderKanoSurveyDocx(buildKanoSurveyDocumentModel(many));
        expect(buffer.subarray(0, 2).toString()).toBe('PK');
    });
});
