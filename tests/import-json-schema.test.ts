// JSON 백업 스키마의 모듈 초기화와 새 그룹 메타데이터 검증을 확인한다.
import { expect, it } from 'vitest';
import { importJsonSchema, MAX_IMPORT_ROWS } from '../lib/import-json-schema';

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

// main 위로 옮기며 들어온 워크시트 컬렉션의 기본값과 문구를 고정한다. 복원은 이 값으로
// 빈 칸을 채우므로 기본값이 바뀌면 백업을 되살린 화면이 달라진다.
it('개선포인트 종류는 니즈와 기능만 받는다', () => {
    expect(importJsonSchema.parse({ improvementItems: [{ type: 'need' }, { type: 'feature' }] }).improvementItems?.map(row => row.type))
        .toEqual(['need', 'feature']);
    expect(importJsonSchema.safeParse({ improvementItems: [{ type: '' }] }).success).toBe(false);
});

it('개발계획 상태가 빠지면 미시작으로, 매출 기간이 빠지면 Y 로 채운다', () => {
    const parsed = importJsonSchema.parse({ devPlans: [{}], salesEstimates: [{}] });
    expect(parsed.devPlans?.[0].status).toBe('미시작');
    expect(parsed.salesEstimates?.[0].period).toBe('Y');
});

it('기업명은 앞뒤 공백을 지우고 복원한다', () => {
    expect(importJsonSchema.parse({ project: { companyName: '  (주)테스트  ' } }).project?.companyName).toBe('(주)테스트');
});

it('같은 이름의 기술특성이 둘이면 이름을 확인하라고 알린다', () => {
    const result = importJsonSchema.safeParse({ technicalCharacteristics: [{ name: '속도' }, { name: '속도' }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(issue => issue.message))
        .toContain('중복된 기술특성이 있습니다. 기술특성 이름을 확인해 주세요.');
});

it('컬렉션마다 행 수 상한을 넘으면 거부한다', () => {
    const tooMany = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({}));
    expect(importJsonSchema.safeParse({ devPlans: tooMany }).success).toBe(false);
    expect(importJsonSchema.safeParse({ devPlans: tooMany.slice(1) }).success).toBe(true);
});
