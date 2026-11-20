import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
    findUnreadableKanoAnswerTexts,
    newAnonymousBatchId,
    normalizeKanoUploadAnswer,
    parseGoogleFormsResponseRows,
    parseKanoTemplateResponseSheet,
    parseWorksheetMatrixRows,
    separateAnonymousRespondents,
} from '../lib/kano-upload-parser';

// 응답 문구는 위에서부터 맞춰 보므로 순서가 틀리면 정반대 점수가 나온다.
// "I dislike it" 에는 "like" 가 들어 있어, 1점을 먼저 보면 싫다가 좋다로 읽혔다(감리 B6).
describe('normalizeKanoUploadAnswer', () => {
    it.each([
        // 자체 설문지 선택지
        ['마음에 든다', 1], ['당연하다', 2], ['아무런느낌이 없다', 3], ['하는수 없다', 4], ['마음에 안든다', 5],
        // 예전 Google Forms 의 이중언어 선택지(lib/google-forms.ts ANSWER_MAP)
        ['😍 매우 만족 (I like it)', 1],
        ['😊 당연함 (I expect it)', 2],
        ['😐 상관없음 (I am neutral)', 3],
        ['😕 견딜만함 (I can tolerate it)', 4],
        ['😠 매우 불만 (I dislike it)', 5],
        // 영문만 쓴 응답
        ['I like it', 1], ['I dislike it', 5], ['Dislike', 5], ['LIKE', 1],
        // 띄어쓰기·변형 문구
        ['마음에 안 든다', 5], ['싫다', 5], ['참을 수 있다', 4], ['어쩔 수 없이 할 수 없다', 4], ['아무렇지 않다', 3], ['중립', 3],
        // 멘티가 Google Forms 에서 직접 만든 설문의 선택지. 못 읽어 4·5점이 통째로 빠졌던 실제 사례.
        ['어쩔 수 없다', 4], ['마음에 들지 않는다', 5], ['마음에 들지않는다', 5],
    ] as const)('%s → %i', (text, expected) => {
        expect(normalizeKanoUploadAnswer(text)).toBe(expected);
    });

    it.each([
        [1, 1], [5, 5], ['3', 3], [' 4 ', 4],
    ] as const)('숫자 %j 는 그 점수로 읽는다', (value, expected) => {
        expect(normalizeKanoUploadAnswer(value)).toBe(expected);
    });

    it.each([0, 6, '6', '', '   ', null, undefined, '모르겠다'])('읽을 수 없는 값 %j 은 null', (value) => {
        expect(normalizeKanoUploadAnswer(value)).toBeNull();
    });

    it('likely 처럼 like 로 시작하는 다른 낱말은 1점으로 읽지 않는다', () => {
        expect(normalizeKanoUploadAnswer('likely')).toBeNull();
    });
});
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

    // 표시 열이 있는 시트에서 빈 답을 위치 기준 열로 채우면, 성별 같은 열이 끼어 있어
    // 다른 질문의 답이 그 질문의 답으로 지어 넣어졌다(2026-11-08 코드 리뷰 12번).
    it('skips a blank labeled answer instead of borrowing another column', () => {
        const answers = parseGoogleFormsResponseRows([
            {
                '성별': '남',
                '👍 [긍정] 빠른 주문 완료': 1,
                '👎 [부정] 빠른 주문 완료': 5,
                '👍 [긍정] 결제 안전성': '',
                '👎 [부정] 결제 안전성': 4,
            },
        ], 2);

        expect(answers.map((answer) => answer.requirementIndex)).toEqual([0]);
    });

    it('still reads unlabeled sheets by column position', () => {
        const answers = parseGoogleFormsResponseRows([
            { 'Q1 좋음': 1, 'Q1 나쁨': 5, 'Q2 좋음': 2, 'Q2 나쁨': 4 },
        ], 2);

        expect(answers.map((answer) => [answer.positiveAnswer, answer.negativeAnswer])).toEqual([[1, 5], [2, 4]]);
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

// 해석기는 못 읽은 칸이 든 문항을 저장하지 않는다. 업로드가 그 사실을 알리려면
// 어떤 문구를 못 읽었는지 먼저 모아야 한다.
describe('findUnreadableKanoAnswerTexts', () => {
    it('Google Forms 응답 열에서 점수로 읽히지 않는 문구만 중복 없이 모은다', () => {
        const rows = [
            ['타임스탬프', '이메일 주소', '[1-1] 빠른 주문', '[1-2] 빠른 주문', '기타 의견'],
            ['2026', 'a@b.c', '그저 그렇다', '마음에 들지 않는다', '아무 말'],
            ['2026', 'd@e.f', '마음에 든다', '그저 그렇다', ''],
            ['2026', 'g@h.i', '', '0', '그냥'],
        ];

        // 빈칸은 응답하지 않은 것이라 세지 않고, 응답 열이 아닌 "기타 의견" 은 보지 않는다.
        expect(findUnreadableKanoAnswerTexts(rows)).toEqual(['그저 그렇다', '0']);
    });

    it('전용 양식처럼 머리글이 3행에 있어도 그 아래 응답만 본다', () => {
        const rows = [
            ['Kano 응답 업로드 양식'],
            ['답변 칸에는 1~5 점수를 입력하세요.'],
            ['email', 'Q1_positive', 'Q1_negative'],
            ['a@b.c', 1, '모름'],
        ];

        expect(findUnreadableKanoAnswerTexts(rows)).toEqual(['모름']);
    });

    it('모두 읽히거나 응답 열이 없으면 빈 목록이다', () => {
        expect(findUnreadableKanoAnswerTexts([['[1-1] 질문', '[1-2] 질문'], ['어쩔 수 없다', 5]])).toEqual([]);
        expect(findUnreadableKanoAnswerTexts([['이름', '메모'], ['홍길동', '아무거나']])).toEqual([]);
        expect(findUnreadableKanoAnswerTexts([])).toEqual([]);
    });
});
