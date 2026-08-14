import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
    buildKanoInviteTemplateWorkbook,
    parseInviteEmailText,
    parseKanoInviteGrid,
    parseKanoInviteWorkbook,
    writeKanoInviteTemplateBuffer,
} from '../lib/kano-invite-template';

describe('응답자 초대 명단 양식', () => {
    it('명단 시트와 작성 안내 시트를 만든다', () => {
        const workbook = buildKanoInviteTemplateWorkbook('테스트 프로젝트');

        expect(workbook.SheetNames).toEqual(['응답자초대명단', '작성안내']);
    });

    it('내려받은 양식을 그대로 다시 읽어도 예시 행만 걸러지고 비어 있다', () => {
        const parsed = parseKanoInviteWorkbook(writeKanoInviteTemplateBuffer());

        expect(parsed.rows).toEqual([]);
        expect(parsed.skipped).toEqual([]);
    });

    it('작성한 양식에서 이메일과 이름을 읽어낸다', () => {
        const sheet = XLSX.utils.aoa_to_sheet([
            ['테스트 응답자 초대 명단'],
            ['이메일 열만 채우면 됩니다.'],
            ['이메일', '이름'],
            ['A@Example.KR', '홍길동'],
            ['b@test.co.kr', ''],
        ]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, '응답자초대명단');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

        const parsed = parseKanoInviteWorkbook(buffer);

        expect(parsed.rows).toEqual([
            { email: 'a@example.kr', name: '홍길동' },
            { email: 'b@test.co.kr', name: '' },
        ]);
    });
});

describe('명단 파싱 규칙', () => {
    it('형식이 잘못된 주소와 파일 내 중복을 이유와 함께 걸러낸다', () => {
        const parsed = parseKanoInviteGrid([
            ['이메일', '이름'],
            ['good@test.com', '정상'],
            ['broken-address', '형식오류'],
            ['GOOD@test.com', '중복'],
            ['', '이메일없음'],
        ]);

        expect(parsed.rows).toEqual([{ email: 'good@test.com', name: '정상' }]);
        expect(parsed.skipped).toEqual([
            { value: 'broken-address', reason: '이메일 형식이 아닙니다.' },
            { value: 'GOOD@test.com', reason: '파일 안에서 중복된 주소입니다.' },
            { value: '이메일없음', reason: '이메일이 비어 있습니다.' },
        ]);
    });

    it('헤더가 없으면 첫 번째 열을 이메일로 본다', () => {
        const parsed = parseKanoInviteGrid([
            ['first@test.com'],
            ['second@test.com'],
        ]);

        expect(parsed.rows.map((row) => row.email)).toEqual(['first@test.com', 'second@test.com']);
    });

    it('이름 열이 이메일 열보다 앞에 있어도 올바르게 읽는다', () => {
        const parsed = parseKanoInviteGrid([
            ['이름', '이메일'],
            ['홍길동', 'hong@test.com'],
        ]);

        expect(parsed.rows).toEqual([{ email: 'hong@test.com', name: '홍길동' }]);
    });
});

describe('직접 붙여 넣은 주소 파싱', () => {
    it('줄바꿈·쉼표·세미콜론·공백을 모두 구분자로 처리한다', () => {
        const parsed = parseInviteEmailText('a@test.com, b@test.com;c@test.com\nd@test.com e@test.com');

        expect(parsed.rows.map((row) => row.email)).toEqual([
            'a@test.com',
            'b@test.com',
            'c@test.com',
            'd@test.com',
            'e@test.com',
        ]);
    });

    it('중복과 형식 오류를 동일한 규칙으로 걸러낸다', () => {
        const parsed = parseInviteEmailText('a@test.com\na@test.com\n엉뚱한값');

        expect(parsed.rows.map((row) => row.email)).toEqual(['a@test.com']);
        expect(parsed.skipped).toHaveLength(2);
    });
});
