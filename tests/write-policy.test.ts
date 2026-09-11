// 업로드 정책 판정이 한 곳에 있고, 알아볼 수 없는 값에서 지우는 쪽으로
// 떨어지지 않는지 확인한다. 예전에는 같은 이름의 함수가 세 곳에 있었고
// 기본값이 서로 반대라, 필드 하나 빠진 요청이 워크시트를 통째로 지웠다.
import { describe, expect, it } from 'vitest';
import { parseWritePolicy } from '../lib/write-policy';

describe('parseWritePolicy', () => {
    it("'replace' 만 덮어쓰기로 본다", () => {
        expect(parseWritePolicy('replace')).toBe('replace');
    });

    it("'append' 는 덧붙이기다", () => {
        expect(parseWritePolicy('append')).toBe('append');
    });

    it.each([null, '', 'Replace', 'REPLACE', ' replace', '지우기', 'true'])(
        '알아볼 수 없는 값 %j 는 덧붙이기로 떨어진다',
        (rawValue) => {
            expect(parseWritePolicy(rawValue as FormDataEntryValue | null)).toBe('append');
        }
    );
});
