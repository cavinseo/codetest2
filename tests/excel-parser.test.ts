// 업로드된 시트에서 셀 값을 꺼내는 경계 조건을 확인하는 테스트.
//
// getCellValue 는 1-indexed 인데 내부 배열은 0-indexed 라, 경계를 한 칸 틀리면
// 다른 셀을 읽고도 예외가 나지 않는다. 범위 밖은 반드시 null 이어야 한다.
import { describe, expect, it } from 'vitest';
import { getCellValue, type ParsedSheet } from '../lib/excel-parser';

const sheet: ParsedSheet = {
    name: '자금소요계획표',
    data: [
        ['구분', '항목', '1년차'],
        ['인건비', '개발자 2명', 1200],
        // 앞 행보다 짧은 행. 실제 엑셀에서 흔하다.
        ['외주비'],
    ],
    rowCount: 3,
    colCount: 3,
};

describe('getCellValue', () => {
    it('1-indexed 좌표로 셀 값을 돌려준다', () => {
        expect(getCellValue(sheet, 1, 1)).toBe('구분');
        expect(getCellValue(sheet, 2, 2)).toBe('개발자 2명');
        expect(getCellValue(sheet, 2, 3)).toBe(1200);
    });

    it('0 이하 좌표는 null 이다', () => {
        expect(getCellValue(sheet, 0, 1)).toBeNull();
        expect(getCellValue(sheet, 1, 0)).toBeNull();
        expect(getCellValue(sheet, -1, -1)).toBeNull();
    });

    it('마지막 행·열은 읽고 그 너머는 null 이다', () => {
        expect(getCellValue(sheet, 3, 1)).toBe('외주비');
        expect(getCellValue(sheet, 4, 1)).toBeNull();
        expect(getCellValue(sheet, 1, 3)).toBe('1년차');
        expect(getCellValue(sheet, 1, 4)).toBeNull();
    });

    it('행마다 길이가 달라도 그 행의 길이를 기준으로 자른다', () => {
        // 3행은 값이 하나뿐이다. 시트 전체 colCount 를 기준으로 삼으면
        // undefined 를 값처럼 돌려주게 된다.
        expect(getCellValue(sheet, 3, 2)).toBeNull();
    });
});
