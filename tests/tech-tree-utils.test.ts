import { describe, expect, it } from 'vitest';
import { buildBlankTechTreeRows, buildTechTreeSpecOptions } from '../lib/tech-tree-utils';

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
