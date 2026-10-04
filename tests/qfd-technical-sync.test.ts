// WS-9 기술특성을 WS-10 세부스펙에서 자동으로 채우는 순수 로직을 검사한다.
import { describe, expect, it } from 'vitest';
import { dedupeNonBlank, findMissingTechnicalCharNames } from '../lib/qfd-technical-sync';

describe('dedupeNonBlank', () => {
    it('빈 값과 공백만 있는 값을 걸러낸다', () => {
        expect(dedupeNonBlank(['센서', null, '', '  ', undefined, '배터리'])).toEqual(['센서', '배터리']);
    });

    it('중복을 걸러내되 먼저 나온 순서를 유지한다', () => {
        expect(dedupeNonBlank(['센서', '배터리', '센서', '통신'])).toEqual(['센서', '배터리', '통신']);
    });

    it('앞뒤 공백이 다른 같은 값도 중복으로 본다', () => {
        expect(dedupeNonBlank([' 센서', '센서 '])).toEqual(['센서']);
    });

    it('입력이 비어 있으면 빈 배열을 돌려준다', () => {
        expect(dedupeNonBlank([])).toEqual([]);
    });

    it('연속 공백·줄바꿈·한글 조합 형태만 다른 이름은 한 번만 남긴다', () => {
        expect(dedupeNonBlank([' 처리  속도 ', '처리\n속도', '처리 속도'.normalize('NFD'), '백업 주기']))
            .toEqual(['처리 속도', '백업 주기']);
    });

    it('다른 수치·단위·기능의 이름은 합치지 않는다', () => {
        expect(dedupeNonBlank(['2D 센서', '3D 센서', '1 ms', '1 MS'])).toHaveLength(4);
    });
});

describe('findMissingTechnicalCharNames', () => {
    it('아직 없는 세부스펙 이름만 남긴다', () => {
        const result = findMissingTechnicalCharNames(['센서', '배터리', '통신'], ['센서']);
        expect(result).toEqual(['배터리', '통신']);
    });

    it('이미 모두 있으면 빈 배열을 돌려준다', () => {
        const result = findMissingTechnicalCharNames(['센서', '배터리'], ['센서', '배터리']);
        expect(result).toEqual([]);
    });

    it('기존 이름의 공백은 트림하고 비교한다', () => {
        const result = findMissingTechnicalCharNames(['센서'], [' 센서 ']);
        expect(result).toEqual([]);
    });

    it('기존 이름에 null 이 섞여 있어도 안전하다', () => {
        const result = findMissingTechnicalCharNames(['센서'], [null, undefined, '']);
        expect(result).toEqual(['센서']);
    });

    it('기존 이름과 후보 이름에 동일한 공백·중복 기준을 적용한다', () => {
        expect(findMissingTechnicalCharNames(['처리 속도', '백업\n주기', '백업  주기'], [' 처리\t속도 ']))
            .toEqual(['백업 주기']);
    });
});
