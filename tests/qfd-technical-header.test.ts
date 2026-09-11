import { describe, expect, it } from 'vitest';
import {
    chunkTechnicalIndexes,
    parseCollapsedGroups,
    qfdCollapsedGroupsStorageKey,
    serializeCollapsedGroups,
    toggleGroupVisibility,
} from '../lib/qfd-technical-header';

describe('qfd technical header helpers', () => {
    it('keeps worksheet technical columns grouped by three', () => {
        expect(chunkTechnicalIndexes(15)).toEqual([
            { groupIndex: 0, start: 0, size: 3 },
            { groupIndex: 1, start: 3, size: 3 },
            { groupIndex: 2, start: 6, size: 3 },
            { groupIndex: 3, start: 9, size: 3 },
            { groupIndex: 4, start: 12, size: 3 },
        ]);
    });

    it('hides a group by adding its index to the collapsed map', () => {
        expect(toggleGroupVisibility({}, 1)).toEqual({ 1: true });
        expect(toggleGroupVisibility({ 0: true }, 1)).toEqual({ 0: true, 1: true });
    });

    it('reveals a hidden group by removing its key instead of setting it to false', () => {
        expect(toggleGroupVisibility({ 1: true }, 1)).toEqual({});
        expect(toggleGroupVisibility({ 0: true, 1: true }, 1)).toEqual({ 0: true });
    });

    it('leaves other groups untouched when toggling one group twice', () => {
        const afterHide = toggleGroupVisibility({ 2: true }, 4);
        expect(afterHide).toEqual({ 2: true, 4: true });
        expect(toggleGroupVisibility(afterHide, 4)).toEqual({ 2: true });
    });

    it('stores collapsed groups per project under a stable key', () => {
        expect(qfdCollapsedGroupsStorageKey('p-1')).toBe('qfd-collapsed-groups:p-1');
    });

    it('serializes only collapsed group indexes in ascending order', () => {
        expect(serializeCollapsedGroups({})).toBe('[]');
        expect(serializeCollapsedGroups({ 3: true, 0: true, 1: false })).toBe('[0,3]');
    });

    it('parses a saved index list back into the collapsed map', () => {
        expect(parseCollapsedGroups('[0,3]')).toEqual({ 0: true, 3: true });
        expect(parseCollapsedGroups(serializeCollapsedGroups({ 2: true, 4: true }))).toEqual({ 2: true, 4: true });
    });

    it('falls back to nothing collapsed when the saved value is missing or broken', () => {
        expect(parseCollapsedGroups(null)).toEqual({});
        expect(parseCollapsedGroups('')).toEqual({});
        expect(parseCollapsedGroups('{not json')).toEqual({});
        expect(parseCollapsedGroups('{"0":true}')).toEqual({});
        expect(parseCollapsedGroups('[1, "2", -1, 1.5, null]')).toEqual({ 1: true });
    });
});
