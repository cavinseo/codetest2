// 빈 열·그룹 제거와 핵심기능 중복 제거 및 그룹 경계 보존을 검증한다.
import { expect, it } from 'vitest';
import { buildTechnicalGroups, assignTechnicalCoreGroups } from '../lib/qfd-technical-groups';

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

it('공백을 정리한 세부기능도 원래 WS-10 핵심기능과 연결한다', () => {
    const groups = buildTechnicalGroups([{ id: 'a', name: '처리 속도', groupIndex: 0 }], [
        { subSpec: '처리\n속도', coreSpec: '처리  성능' },
        { subSpec: '처리 속도'.normalize('NFD'), coreSpec: '처리 성능' },
    ]);
    expect(groups[0].coreNames).toEqual(['처리 성능']);
});

it('3개씩 섞인 기능을 핵심스펙별로 모으고 기존 식별자와 입력값을 보존한다', () => {
    const technicals = ['투입', '이송', '가공', '검사', '배출'].map((name, index) => ({
        id: `t${index}`, name, groupIndex: Math.floor(index / 3), columnOrder: index, unit: 'ms', targetValue: '100',
    }));
    const entries = [
        { coreSpec: 'CNC', subSpec: '투입' }, { coreSpec: '이송계', subSpec: '이송' },
        { coreSpec: 'CNC', subSpec: '가공' }, { coreSpec: '검사계', subSpec: '검사' },
        { coreSpec: 'CNC', subSpec: '배출' }, { coreSpec: ' CNC ', subSpec: ' 투입 ' },
    ];
    const result = assignTechnicalCoreGroups(technicals, entries);
    expect(buildTechnicalGroups(result, entries).map(group => [group.coreNames, group.technicals.map(tech => tech.name)]))
        .toEqual([[['CNC'], ['투입', '가공', '배출']], [['이송계'], ['이송']], [['검사계'], ['검사']]]);
    for (const tech of result) expect(tech).toMatchObject({ ...technicals.find(row => row.id === tech.id), groupIndex: tech.groupIndex, columnOrder: tech.columnOrder });
    expect(technicals.map(tech => tech.groupIndex)).toEqual([0, 0, 0, 1, 1]);
    expect(assignTechnicalCoreGroups(result, entries)).toEqual(result);
});

it('WS-10에서 제외되거나 직접 추가한 기능은 별도 기존 그룹으로 보존한다', () => {
    const rows = [{ id: 'a', name: '선택 기능', groupIndex: 0 }, { id: 'b', name: '수동 기능', groupIndex: 0 }];
    const entries = [{ coreSpec: '핵심', subSpec: '선택 기능' }];
    const result = assignTechnicalCoreGroups(rows, entries);
    expect(result.map(row => [row.id, row.groupIndex])).toEqual([['a', 0], ['b', 1]]);
    expect(assignTechnicalCoreGroups(result, [])).toEqual(result);
    expect(assignTechnicalCoreGroups([rows[1]], entries)).toEqual([rows[1]]);
});
