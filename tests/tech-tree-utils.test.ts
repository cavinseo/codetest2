import { describe, expect, it } from 'vitest';
import {
    buildBlankTechTreeRows,
    buildTechTreeSpecOptions,
    filterTechTreeSpecOptionsByCore,
    findTechTreeTechCharacteristic,
} from '../lib/tech-tree-utils';

describe('tech tree helpers', () => {
    it('leaves WS-10 spec fields blank when generating rows from customer voices', () => {
        const rows = buildBlankTechTreeRows(
            [{ id: 'req-1', requirement: 'Work faster' }],
            [
                { id: 'core-1', level: 'CORE', name: 'Core feature', technology: 'Core tech', order: 0 },
                { id: 'sub-1', level: 'SUB', parentId: 'core-1', name: 'Sub feature', technology: 'Sub tech', order: 1 },
            ],
            100
        );

        expect(rows).toEqual([
            {
                id: 'tt_100_req-1_0',
                customerVoice: 'Work faster',
                coreSpec: '',
                subSpec: '',
                techCharacteristic: '',
                order: 0,
            },
        ]);
    });

    it('builds AS-IS sub-spec popup options with related core and technology', () => {
        const options = buildTechTreeSpecOptions([
            { id: 'core-1', level: 'CORE', name: 'Core feature', technology: 'Core tech', order: 0 },
            { id: 'sub-1', level: 'SUB', parentId: 'core-1', name: 'Sub feature', technology: 'Sub tech', order: 1 },
            { id: 'detail-1', level: 'DETAIL', parentId: 'sub-1', name: 'Detail feature', technology: 'Detail tech', order: 2 },
        ]);

        expect(options).toEqual([
            {
                coreSpec: 'Core feature',
                subSpec: 'Detail feature',
                techCharacteristic: 'Detail tech',
            },
        ]);
    });
});

// 세부스펙 목록을 핵심스펙 하위로 좁히고, 고른 세부스펙의 적용기술을 그대로 불러오는 규칙.
// 두 함수 모두 사용자가 손으로 적은 값과도 맞춰야 하므로 앞뒤 공백을 무시한다.
const OPTIONS = [
    { coreSpec: '측정', subSpec: '온도 측정', techCharacteristic: '열전대' },
    { coreSpec: '측정', subSpec: '습도 측정', techCharacteristic: '정전용량 센서' },
    { coreSpec: '제어', subSpec: '온도 측정', techCharacteristic: 'PID 제어' },
    { coreSpec: '제어', subSpec: '밸브 개폐', techCharacteristic: '' },
];

describe('filterTechTreeSpecOptionsByCore', () => {
    it('핵심스펙 하위 세부스펙만 남긴다', () => {
        expect(filterTechTreeSpecOptionsByCore(OPTIONS, '측정')).toEqual([
            { coreSpec: '측정', subSpec: '온도 측정', techCharacteristic: '열전대' },
            { coreSpec: '측정', subSpec: '습도 측정', techCharacteristic: '정전용량 센서' },
        ]);
    });

    it('핵심스펙이 비었으면 좁힐 기준이 없어 전부 돌려준다', () => {
        expect(filterTechTreeSpecOptionsByCore(OPTIONS, '   ')).toEqual(OPTIONS);
    });

    it('핵심스펙과 후보의 앞뒤 공백은 무시하고 맞춘다', () => {
        expect(filterTechTreeSpecOptionsByCore(
            [{ coreSpec: ' 측정 ', subSpec: '온도 측정', techCharacteristic: '열전대' }],
            ' 측정'
        )).toEqual([{ coreSpec: ' 측정 ', subSpec: '온도 측정', techCharacteristic: '열전대' }]);
    });

    it('맞는 핵심스펙이 없으면 빈 목록이다', () => {
        expect(filterTechTreeSpecOptionsByCore(OPTIONS, '기록')).toEqual([]);
    });
});

describe('findTechTreeTechCharacteristic', () => {
    it('같은 핵심스펙 아래 세부스펙의 적용기술을 돌려준다', () => {
        expect(findTechTreeTechCharacteristic(OPTIONS, '측정', '온도 측정')).toBe('열전대');
    });

    it('이름이 같은 세부스펙이 다른 핵심스펙에도 있으면 행의 핵심스펙 것을 고른다', () => {
        expect(findTechTreeTechCharacteristic(OPTIONS, '제어', '온도 측정')).toBe('PID 제어');
    });

    it('핵심스펙과 세부스펙의 앞뒤 공백은 무시하고 맞춘다', () => {
        expect(findTechTreeTechCharacteristic(
            [{ coreSpec: '측정', subSpec: ' 온도 측정 ', techCharacteristic: ' 열전대 ' }],
            ' 측정 ',
            ' 온도 측정 '
        )).toBe('열전대');
    });

    it('세부스펙을 지우는 중이면 이름이 빈 후보와 맞추지 않는다', () => {
        expect(findTechTreeTechCharacteristic(
            [{ coreSpec: '측정', subSpec: '', techCharacteristic: '열전대' }],
            '측정',
            '  '
        )).toBe('');
    });

    it('맞는 세부스펙이 없거나 적용기술이 비었으면 빈 문자열이다', () => {
        expect(findTechTreeTechCharacteristic(OPTIONS, '측정', '유량 측정')).toBe('');
        expect(findTechTreeTechCharacteristic(OPTIONS, '제어', '밸브 개폐')).toBe('');
    });
});
