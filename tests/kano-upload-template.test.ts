import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { writeKanoGoogleFormsTemplateBuffer, writeKanoUploadTemplateBuffer } from '../lib/kano-upload-template';

describe('Kano upload template', () => {
    it('builds a dedicated response upload workbook from project requirements', () => {
        const buffer = writeKanoUploadTemplateBuffer([
            { requirement: '주문을 빠르게 완료하고 싶다', kanoPositiveQ: '빠른 주문이 있으면?', kanoNegativeQ: '빠른 주문이 없으면?' },
            { requirement: '결제가 안전해야 한다' },
        ], '테스트 프로젝트');

        const workbook = XLSX.read(buffer, { type: 'buffer' });
        expect(workbook.SheetNames).toEqual(['Kano응답업로드', 'Kano질문목록', '응답점수안내']);

        const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['Kano응답업로드'], { header: 1 });
        expect(rows[2]).toEqual(['email', 'Q1_positive', 'Q1_negative', 'Q2_positive', 'Q2_negative']);

        const questionRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['Kano질문목록'], { header: 1 });
        expect(questionRows[1]).toEqual([1, '주문을 빠르게 완료하고 싶다', '빠른 주문이 있으면?', '빠른 주문이 없으면?']);

        const guideRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['응답점수안내'], { header: 1 });
        expect(guideRows).toContainEqual([3, '아무런느낌이 없다']);
        expect(guideRows).toContainEqual([4, '하는수 없다']);
        expect(guideRows).toContainEqual([5, '마음에 안든다']);
    });

    it('builds a Google Forms response-sheet compatible upload workbook', () => {
        const buffer = writeKanoGoogleFormsTemplateBuffer([
            {
                category: '배송',
                subcategory: '속도',
                requirement: '빠른 주문 완료',
                kanoPositiveQ: '빠른 주문 완료가 있으면?',
                kanoNegativeQ: '빠른 주문 완료가 없으면?',
            },
        ], '테스트 프로젝트');

        const workbook = XLSX.read(buffer, { type: 'buffer' });
        expect(workbook.SheetNames).toEqual(['설문지 응답 시트1', '응답점수안내']);

        const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['설문지 응답 시트1'], { header: 1 });
        expect(rows[0]).toEqual([
            '타임스탬프',
            '이메일 주소',
            '👍 [긍정] [배송 > 속도] 빠른 주문 완료',
            '👎 [부정] [배송 > 속도] 빠른 주문 완료',
        ]);
        expect(rows[1]).toEqual(['2026-05-29 10:00:00', 'respondent1@example.com', '', '']);
    });
});
