// 빈 열·그룹 제거와 핵심기능 중복 제거 및 그룹 경계 보존을 검증한다.
import { expect, it } from 'vitest';
import { buildTechnicalGroups } from '../lib/qfd-technical-groups';

it('내용이 없는 열과 그 열만 있던 그룹을 표시하지 않는다', () => {
    const tech = { id: 'a', name: '센서', groupIndex: 2 };
    expect(buildTechnicalGroups([{ id: 'empty', name: '  ', groupIndex: 0 }, tech], [])).toEqual([{ groupIndex: 2, technicals: [tech], coreNames: [] }]);
    expect(buildTechnicalGroups([], [])).toEqual([]);
});
it('삭제 후에도 다른 그룹을 당겨 섞지 않고 저장 순서를 지킨다', () => {
    const a = { id: 'a', name: '센서', groupIndex: 5, columnOrder: 2 };
    const b = { id: 'b', name: '통신', groupIndex: 5, columnOrder: 1 };
    const c = { id: 'c', name: '배터리', groupIndex: 2, columnOrder: 1 };
    const input = [a, b, c];
    expect(buildTechnicalGroups(input, []).map(g => [g.groupIndex, g.technicals.map(t => t.id)])).toEqual([[2, ['c']], [5, ['b', 'a']]]);
    expect(input).toEqual([a, b, c]);
});
it('그룹 소속 세부기능에 연결된 모든 핵심기능을 공백·중복 없이 표시한다', () => {
    const groups = buildTechnicalGroups([{ id: 'a', name: ' 센서 ', groupIndex: 0 }, { id: 'b', name: '전송', groupIndex: 0 }], [
        { subSpec: '센서', coreSpec: '측정' }, { subSpec: ' 센서 ', coreSpec: ' 측정 ' },
        { subSpec: '전송', coreSpec: '통신' }, { subSpec: '다른 기능', coreSpec: '제외' },
        { subSpec: '센서', coreSpec: null }, { subSpec: null, coreSpec: '제외' },
    ]);
    expect(groups[0].coreNames).toEqual(['측정', '통신']);
});
