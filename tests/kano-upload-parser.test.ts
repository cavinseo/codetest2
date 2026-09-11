import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseGoogleFormsResponseRows, parseKanoTemplateResponseSheet, parseWorksheetMatrixRows } from '../lib/kano-upload-parser';
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

    // dysfunctional 이 functional 을 부분문자열로 품고 있어, 부정 열을 먼저 걸러내지
    // 않으면 긍정 목록에 부정 열까지 들어가 요구사항 순서가 한 칸씩 밀린다.
    it('keeps English functional/dysfunctional columns paired with the right requirement', () => {
        const answers = parseGoogleFormsResponseRows([
            {
                'Timestamp': '2026-05-29 10:00:00',
                'Email Address': 'respondent@example.com',
                'Q1 (functional)': 1,
                'Q1 (dysfunctional)': 5,
                'Q2 (functional)': 2,
                'Q2 (dysfunctional)': 4,
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

    it('reads worksheet KANO matrix answers from the workbook answer block start column', () => {
        const rows: unknown[][] = [
            ['', '', '', 1, '', '', '', '', '', '', '', '', '', '', '', 2],
            ['', '', '', '(1)마음에 든다', '(2)당연하다', '(3)아무런 느낌이 없다', '(4)하는수 없다.', '(5)마음에 안든다', '', '', '', '', '', '', '', '(1)마음에 든다', '(2)당연하다', '(3)아무런 느낌이 없다', '(4)하는수 없다.', '(5)마음에 안든다', '(6)기타'],
            [1, 0, '긍정적 질문', 1, '', '', '', '', '', '', '', '', '', '', '', '', 1],
            ['', '', '부정적 질문', '', '', '', '', 1, '', '', '', '', '', '', '', '', '', '', 1],
        ];

        expect(parseWorksheetMatrixRows(rows, 1)).toEqual([
            {
                respondentEmail: 'excel-respondent-1@import.local',
                requirementIndex: 0,
                positiveAnswer: 1,
                negativeAnswer: 5,
            },
            {
                respondentEmail: 'excel-respondent-2@import.local',
                requirementIndex: 0,
                positiveAnswer: 2,
                negativeAnswer: 4,
            },
        ]);
    });

    it('reads worksheet KANO matrix answers marked with circles', () => {
        const rows: unknown[][] = [
            ['', '', '', 1],
            ['', '', '', '(1)마음에 든다', '(2)당연하다', '(3)아무런 느낌이 없다', '(4)하는수 없다.', '(5)마음에 안든다'],
            [1, 0, '긍정적 질문', '○'],
            ['', '', '부정적 질문', '', '', '', '', '○'],
        ];

        expect(parseWorksheetMatrixRows(rows, 1)).toEqual([
            {
                respondentEmail: 'excel-respondent-1@import.local',
                requirementIndex: 0,
                positiveAnswer: 1,
                negativeAnswer: 5,
            },
        ]);
    });
});
