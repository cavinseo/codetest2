// JSON 백업 스키마의 모듈 초기화와 새 그룹 메타데이터 검증을 확인한다.
import { expect, it } from 'vitest';
import { importJsonSchema } from '../lib/import-json-schema';

it.each(['', '  ', '\t\n'])('공백 세부기능 %j의 복원을 거부한다', name => {
    const result = importJsonSchema.safeParse({ technicalCharacteristics: [{ name }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ['technicalCharacteristics', 0, 'name'], message: '세부기능을 입력해 주세요.' }),
    ]));
});

it('백업 스키마를 로드하고 그룹 번호 0과 열 순서 0을 보존한다', () => {
    const payload = { technicalCharacteristics: [{ name: '기능', groupIndex: 0, columnOrder: 0 }] };
    expect(importJsonSchema.parse(payload).technicalCharacteristics).toEqual(payload.technicalCharacteristics);
});

it('결과보고서 출처 개정값이 포함된 내보내기 파일을 복원용으로 받는다', () => {
    const sourceRevision = 'a'.repeat(64);
    expect(importJsonSchema.parse({ sourceRevision }).sourceRevision).toBe(sourceRevision);
});

it.each(['short', 'g'.repeat(64), `${'a'.repeat(64)}extra`, `extra${'a'.repeat(64)}`])('잘못된 출처 개정값 %s은 백업 복원에서 거부한다', sourceRevision => {
    expect(importJsonSchema.safeParse({ sourceRevision }).success).toBe(false);
});

it('보완자산 유형도 백업에서 복원한다', () => {
    expect(importJsonSchema.parse({ assetItems: [{ type: 'COMPLEMENTARY' }] }).assetItems?.[0].type).toBe('COMPLEMENTARY');
});
