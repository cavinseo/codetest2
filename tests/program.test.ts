import { describe, expect, it } from 'vitest';
import { canManageThisProgram, canOwnProjectIn, isValidProgramPeriod, projectImportOutcome } from '../lib/program';

describe('canManageThisProgram', () => {
    it('관리자는 어떤 프로그램이든 만질 수 있다', () => {
        expect(canManageThisProgram(
            { role: 'ADMIN', userId: 'admin_1' },
            { managerId: 'pm_1' }
        )).toBe(true);
    });

    it('매니저는 자신이 개설한 프로그램만 만질 수 있다', () => {
        expect(canManageThisProgram(
            { role: 'PROGRAM_MANAGER', userId: 'pm_1' },
            { managerId: 'pm_1' }
        )).toBe(true);
    });

    it('매니저는 다른 매니저의 프로그램을 만질 수 없다', () => {
        expect(canManageThisProgram(
            { role: 'PROGRAM_MANAGER', userId: 'pm_2' },
            { managerId: 'pm_1' }
        )).toBe(false);
    });

    it('멘토·멘티는 어떤 프로그램도 만질 수 없다', () => {
        expect(canManageThisProgram({ role: 'MENTOR', userId: 'mentor_1' }, { managerId: 'mentor_1' })).toBe(false);
        expect(canManageThisProgram({ role: 'MENTEE', userId: 'mentee_1' }, { managerId: 'mentee_1' })).toBe(false);
    });
});

describe('canOwnProjectIn', () => {
    it('자신이 속한 프로그램의 프로젝트는 소유할 수 있다', () => {
        expect(canOwnProjectIn({ role: 'MENTEE', programId: 'prog_1' }, 'prog_1')).toBe(true);
    });

    it('다른 프로그램의 프로젝트는 소유할 수 없다', () => {
        // 초대 코드가 프로그램에 묶이므로, 멘티는 자신이 가입한 프로그램 밖의
        // 프로젝트 소유자가 될 수 없다.
        expect(canOwnProjectIn({ role: 'MENTEE', programId: 'prog_1' }, 'prog_2')).toBe(false);
    });

    it('어느 프로그램에도 속하지 않은 멘티는 소유할 수 없다', () => {
        expect(canOwnProjectIn({ role: 'MENTEE', programId: null }, 'prog_1')).toBe(false);
    });

    it('멘티가 아니면 프로그램이 같아도 소유할 수 없다', () => {
        // 매니저·관리자·멘토는 이 판정 대상이 아니다. 프로젝트 소유는 멘티의 자리다.
        expect(canOwnProjectIn({ role: 'PROGRAM_MANAGER', programId: 'prog_1' }, 'prog_1')).toBe(false);
        expect(canOwnProjectIn({ role: 'MENTOR', programId: 'prog_1' }, 'prog_1')).toBe(false);
        expect(canOwnProjectIn({ role: 'ADMIN', programId: 'prog_1' }, 'prog_1')).toBe(false);
    });
});

describe('isValidProgramPeriod', () => {
    it('종료가 시작보다 뒤면 유효하다', () => {
        expect(isValidProgramPeriod(new Date('2026-01-01'), new Date('2026-06-30'))).toBe(true);
    });

    it('종료가 시작과 같으면 무효하다', () => {
        const d = new Date('2026-01-01');
        expect(isValidProgramPeriod(d, new Date(d))).toBe(false);
    });

    it('종료가 시작보다 앞이면 무효하다', () => {
        expect(isValidProgramPeriod(new Date('2026-06-30'), new Date('2026-01-01'))).toBe(false);
    });
});

describe('projectImportOutcome', () => {
    it('이미 이 프로그램 소속이면 already-here', () => {
        expect(projectImportOutcome({ programId: 'prog_1' }, 'prog_1', false)).toBe('already-here');
        // 이미 여기 있으므로 confirmed 값과 무관하게 already-here 다.
        expect(projectImportOutcome({ programId: 'prog_1' }, 'prog_1', true)).toBe('already-here');
    });

    it('다른 프로그램 소속인데 확인을 안 받았으면 needs-confirm', () => {
        expect(projectImportOutcome({ programId: 'prog_1' }, 'prog_2', false)).toBe('needs-confirm');
    });

    it('다른 프로그램 소속이어도 확인을 받았으면 ok', () => {
        expect(projectImportOutcome({ programId: 'prog_1' }, 'prog_2', true)).toBe('ok');
    });
});
