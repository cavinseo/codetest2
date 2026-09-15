// JSON 백업 스키마의 모듈 초기화와 새 그룹 메타데이터 검증을 확인한다.
import { expect, it } from 'vitest';

it.each(['', '  ', '\t\n'])('공백 세부기능 %j의 복원을 거부한다', async name => {
    const { importJsonSchema } = await import('../lib/import-json-schema');
    const result = importJsonSchema.safeParse({ technicalCharacteristics: [{ name }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ['technicalCharacteristics', 0, 'name'], message: '세부기능을 입력해 주세요.' }),
    ]));
});

it('백업 스키마를 로드하고 그룹 번호 0과 열 순서 0을 보존한다', async () => {
    const { importJsonSchema } = await import('../lib/import-json-schema');
    const payload = { technicalCharacteristics: [{ name: '기능', groupIndex: 0, columnOrder: 0 }] };
    expect(importJsonSchema.parse(payload).technicalCharacteristics).toEqual(payload.technicalCharacteristics);
});
