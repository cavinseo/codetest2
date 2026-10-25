import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
    newAnonymousBatchId,
    normalizeKanoUploadAnswer,
    parseGoogleFormsResponseRows,
    parseKanoTemplateResponseSheet,
    parseWorksheetMatrixRows,
    separateAnonymousRespondents,
} from '../lib/kano-upload-parser';
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

// 2026-10-25 코드 리뷰 B3: dislike 안의 like 가 먼저 걸려 5점이 1점으로 읽혔다.
describe('영문 Kano 응답 문구 (B3)', () => {
    it.each([
        ['I like it', 1],
        ['I expect it', 2],
        ['I am neutral', 3],
        ['I can tolerate it', 4],
        ['I dislike it', 5],
        ['Dislike', 5],
    ])('%s → %i', (text, expected) => {
        expect(normalizeKanoUploadAnswer(text)).toBe(expected);
    });

    it('영문 Google Forms 응답 파일에서 dislike 를 싫다(5)로 분류한다', () => {
        const answers = parseGoogleFormsResponseRows([
            {
                'Email Address': 'respondent@example.com',
                '[Positive] Fast checkout': 'I like it',
                '[Negative] Fast checkout': 'I dislike it',
            },
        ], 1);

        expect(answers).toEqual([
            { respondentEmail: 'respondent@example.com', requirementIndex: 0, positiveAnswer: 1, negativeAnswer: 5 },
        ]);
    });
});

// 2026-10-25 코드 리뷰 B4: 익명 행 번호 주소가 업로드마다 1번부터 다시 매겨졌다.
describe('업로드별 익명 응답자 분리 (B4)', () => {
    const anonymous = { respondentEmail: 'excel-row-1@import.local', requirementIndex: 0, positiveAnswer: 1, negativeAnswer: 5 } as const;
    const named = { ...anonymous, respondentEmail: 'respondent@example.com' };

    it('익명 주소에만 업로드 표식을 끼우고 실제 이메일은 그대로 둔다', () => {
        expect(separateAnonymousRespondents([anonymous, named], 'batch1')).toEqual([
            { ...anonymous, respondentEmail: 'excel-row-1-batch1@import.local' },
            named,
        ]);
    });

    it('두 업로드의 같은 행 번호 익명 응답자는 서로 다른 사람이 된다', () => {
        const first = separateAnonymousRespondents([anonymous], newAnonymousBatchId())[0].respondentEmail;
        const second = separateAnonymousRespondents([anonymous], newAnonymousBatchId())[0].respondentEmail;

        expect(first).not.toBe(second);
        expect(first).toMatch(/^excel-row-1-[0-9a-f]{12}@import\.local$/);
    });
});

// 2026-10-25 코드 리뷰 B8: 2.5 같은 소수 응답이 통과해 정수 열 저장에서 업로드 전체가 실패했다.
describe('소수 응답 (B8)', () => {
    it.each([2.5, 1.0001, 0, 6, Number.NaN])('%d 는 응답으로 받지 않는다', (value) => {
        expect(normalizeKanoUploadAnswer(value)).toBeNull();
    });

    it('1~5 정수는 그대로 받는다', () => {
        expect([1, 2, 3, 4, 5].map(normalizeKanoUploadAnswer)).toEqual([1, 2, 3, 4, 5]);
    });

    it('소수 응답이 섞인 행은 그 요구사항만 빼고 나머지를 가져온다', () => {
        const answers = parseGoogleFormsResponseRows([
            {
                'Email Address': 'respondent@example.com',
                '[Positive] A': 2.5,
                '[Negative] A': 5,
                '[Positive] B': 1,
                '[Negative] B': 4,
            },
        ], 2);

        expect(answers).toEqual([
            { respondentEmail: 'respondent@example.com', requirementIndex: 1, positiveAnswer: 1, negativeAnswer: 4 },
        ]);
    });
});
