// 프로그램별 회원 보기의 소속 판정과 선택값 유지·초기화를 검증한다.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ALL_PROGRAMS, belongsToProgram, clearStoredProgramFilter, readStoredProgramFilter,
    relatedProgramIds, storeProgramFilter,
} from '../lib/member-program-filter';

describe('relatedProgramIds', () => {
    it('담당 멘티와 직접 담당 프로그램을 중복 없이 합치고 미배정 멘티는 뺀다', () => {
        expect(relatedProgramIds({
            assignedMentees: [
                { mentee: { programId: 'a' } },
                { mentee: { programId: 'a' } },
                { mentee: { programId: null } },
            ],
            managedPrograms: [{ id: 'a' }, { id: 'b' }],
        })).toEqual(['a', 'b']);
    });
});

describe('belongsToProgram', () => {
    it('전체 보기에는 소속이 없는 회원도 포함한다', () => {
        expect(belongsToProgram({}, ALL_PROGRAMS)).toBe(true);
    });
    it('멘티는 자기 프로그램으로, 멘토는 관계된 프로그램으로 판정한다', () => {
        expect(belongsToProgram({ programId: 'a' }, 'a')).toBe(true);
        expect(belongsToProgram({ programId: 'a' }, 'b')).toBe(false);
        expect(belongsToProgram({ programId: null, relatedProgramIds: ['a'] }, 'a')).toBe(true);
        expect(belongsToProgram({ programId: null, relatedProgramIds: ['a'] }, 'b')).toBe(false);
    });
    it('소속 정보가 없으면 특정 프로그램에 속하지 않는다', () => {
        expect(belongsToProgram({}, 'a')).toBe(false);
    });
});

describe('선택값 보관', () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it('처음에는 전체이고, 저장한 값을 돌려주며, 지우면 전체로 돌아간다', () => {
        expect(readStoredProgramFilter()).toBe(ALL_PROGRAMS);
        storeProgramFilter('a');
        expect(window.localStorage.getItem('admin-program-filter')).toBe('a');
        expect(readStoredProgramFilter()).toBe('a');
        clearStoredProgramFilter();
        expect(readStoredProgramFilter()).toBe(ALL_PROGRAMS);
    });
    it('저장소가 예외를 던져도 전체로 동작한다', () => {
        for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
            vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error('blocked'); });
        }
        expect(() => storeProgramFilter('a')).not.toThrow();
        expect(() => clearStoredProgramFilter()).not.toThrow();
        expect(readStoredProgramFilter()).toBe(ALL_PROGRAMS);
    });
});
