import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseGoogleFormsResponseRows, parseKanoTemplateResponseSheet } from '../lib/kano-upload-parser';
import { writeKanoUploadTemplateBuffer } from '../lib/kano-upload-template';

describe('Kano Google Forms upload parser', () => {
    it('maps Google Forms response-sheet columns to requirement answers by positive/negative order', () => {
        const answers = parseGoogleFormsResponseRows([
            {
                '타임스탬프': '2026-05-29 10:00:00',
                '이메일 주소': 'respondent@example.com',
                '👍 [긍정] [배송 > 속도] 빠른 주문 완료': '마음에 든다',
                '👎 [부정] [배송 > 속도] 빠른 주문 완료': '마음에 안든다',
                '👍 [긍정] 결제 안전성': '2',
                '👎 [부정] 결제 안전성': 4,
            },
        ], 2);

        expect(answers).toEqual([
            {
                respondentEmail: 'respondent@example.com',
                requirementIndex: 0,
                positiveAnswer: 1,
                negativeAnswer: 5,
            },
            {
                respondentEmail: 'respondent@example.com',
                requirementIndex: 1,
                positiveAnswer: 2,
                negativeAnswer: 4,
            },
        ]);
    });

    it('reads the dedicated upload workbook even when the header starts on row 3', () => {
        const buffer = writeKanoUploadTemplateBuffer([
            { requirement: '빠른 주문 완료' },
            { requirement: '결제 안전성' },
        ], '테스트 프로젝트');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        sheet.A4 = { t: 's', v: 'respondent@example.com' };
        sheet.B4 = { t: 's', v: '마음에 든다' };
        sheet.C4 = { t: 's', v: '마음에 안든다' };
        sheet.D4 = { t: 'n', v: 2 };
        sheet.E4 = { t: 'n', v: 4 };

        expect(parseKanoTemplateResponseSheet(sheet, 2)).toEqual([
            {
                respondentEmail: 'respondent@example.com',
                requirementIndex: 0,
                positiveAnswer: 1,
                negativeAnswer: 5,
            },
            {
                respondentEmail: 'respondent@example.com',
                requirementIndex: 1,
                positiveAnswer: 2,
                negativeAnswer: 4,
            },
        ]);
    });
});
