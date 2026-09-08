import { describe, expect, it } from 'vitest';
import { buildBlankTechTreeRows, buildTechTreeSpecOptions, applyTechTreeSpecSelection, findTechTreeSpecOptions } from '../lib/tech-tree-utils';

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
            { id: 'sub-1', coreId: 'core-1', parentId: 'core-1', depth: 0, coreSpec: 'Core feature', subSpec: 'Sub feature', techCharacteristic: 'Sub tech' },
            {
                id: 'detail-1', coreId: 'core-1', parentId: 'sub-1', depth: 1,
                coreSpec: 'Core feature',
                subSpec: 'Detail feature',
                techCharacteristic: 'Detail tech',
            },
        ]);
    });
});

it('does not substitute core or ancestor technology for missing descendants', () => {
    expect(buildTechTreeSpecOptions([{id:'a',level:'CORE',name:'A',technology:'A tech'}])).toEqual([]);
    expect(buildTechTreeSpecOptions([{id:'a',level:'CORE',name:'A',technology:'A tech'},{id:'b',level:'SUB',parentId:'a',name:'B'}])[0].techCharacteristic).toBe('');
});

it('applies duplicate-name choices only to rows captured before opening the picker', () => {
    const rows = [
        { id: 'first', customerVoice: 'Need', coreSpec: 'Core', subSpec: 'Common', techCharacteristic: 'A', order: 0 },
        { id: 'second', customerVoice: 'Need', coreSpec: 'Core', subSpec: '', techCharacteristic: '', order: 1 },
    ];
    const option = { id: 'b', coreId: 'core', parentId: 'sub-b', depth: 1 as const, coreSpec: 'Core', subSpec: 'Common', techCharacteristic: 'B' };
    const selected = applyTechTreeSpecSelection(rows, ['second'], option);
    expect(selected[0]).toEqual(rows[0]);
    expect(selected[1]).toMatchObject({ subSpec: 'Common', techCharacteristic: 'B' });
    const repeated = applyTechTreeSpecSelection(selected, ['second'], { ...option, techCharacteristic: 'C' });
    expect(repeated[0].techCharacteristic).toBe('A');
    expect(repeated[1].techCharacteristic).toBe('C');
});

it('keeps same-name source choices separate after saving and matches their original names', () => {
    const options = buildTechTreeSpecOptions([
        { id: 'core', level: 'CORE', name: 'Core' },
        { id: 'a', level: 'SUB', parentId: 'core', name: 'Fast' },
        { id: 'b', level: 'SUB', parentId: 'core', name: 'Slow' },
        { id: 'da', level: 'DETAIL', parentId: 'a', name: 'Common', technology: 'A' },
        { id: 'db', level: 'DETAIL', parentId: 'b', name: 'Common', technology: 'B' },
    ]);
    const matches = findTechTreeSpecOptions(options, 'Core', 'Common');
    expect(matches.map((option) => option.subSpec)).toEqual(['Fast > Common', 'Slow > Common']);
    expect(findTechTreeSpecOptions(options, 'Core', 'Fast > Common')).toEqual([matches[0]]);
    expect(findTechTreeSpecOptions(options, 'Other', 'Common')).toEqual([]);
    expect(findTechTreeSpecOptions(options, 'Core', 'Fast')[0].subSpec).toBe('Fast');
    const rows = [0, 1].map((order) => ({ id: String(order), customerVoice: 'Need', coreSpec: 'Core', subSpec: '', techCharacteristic: '', order }));
    const first = applyTechTreeSpecSelection(rows, ['0'], matches[0]);
    const second = applyTechTreeSpecSelection(first, ['1'], matches[1]);
    expect(second.map((row) => row.subSpec)).toEqual(['Fast > Common', 'Slow > Common']);
    expect(second.map((row) => row.techCharacteristic)).toEqual(['A', 'B']);
});
