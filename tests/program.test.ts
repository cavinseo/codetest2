import { describe, expect, it } from 'vitest';
import { canManageThisProgram, canOwnProjectIn, isValidProgramPeriod, programEndDeadline, programMoveOutcome } from '../lib/program';

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

// 종료일은 그날 한국 시간 끝까지 유효하다. 화면이 보낸 날짜를 그대로 new Date() 에 넣으면
// UTC 자정(=KST 09:00)이 되어, 종료일 당일 오전 9시부터 가입·로그인이 막혔다(감리 B8).
describe('programEndDeadline', () => {
    it.each([
        ['화면이 보낸 날짜(UTC 자정 = KST 09:00)', '2026-12-31T00:00:00.000Z'],
        ['KST 자정 직후', '2026-12-30T15:00:00.000Z'],
        ['KST 하루의 마지막 순간', '2026-12-31T14:59:59.999Z'],
        ['KST 오후', '2026-12-31T06:30:00.000Z'],
    ])('%s 은 그날 한국 시간 끝으로 맞춘다', (_label, stored) => {
        expect(programEndDeadline(new Date(stored)).toISOString()).toBe('2026-12-31T14:59:59.999Z');
    });

    it('KST 로 다음 날이 되는 시각은 다음 날 끝으로 맞춘다', () => {
        // UTC 로는 12-31 이지만 KST 로는 이미 01-01 이다.
        expect(programEndDeadline(new Date('2026-12-31T15:00:00.000Z')).toISOString()).toBe('2027-01-01T14:59:59.999Z');
    });

    it('두 번 거쳐도 같은 값이다(저장할 때와 판정할 때 모두 거친다)', () => {
        const once = programEndDeadline(new Date('2026-12-31T00:00:00.000Z'));
        expect(programEndDeadline(once).getTime()).toBe(once.getTime());
    });
});

describe('programMoveOutcome', () => {
    it('이미 이 프로그램 소속이면 already-here', () => {
        expect(programMoveOutcome('prog_1', 'prog_1', false)).toBe('already-here');
        // 이미 여기 있으므로 confirmed 값과 무관하게 already-here 다.
        expect(programMoveOutcome('prog_1', 'prog_1', true)).toBe('already-here');
    });

    it('다른 프로그램 소속인데 확인을 안 받았으면 needs-confirm', () => {
        expect(programMoveOutcome('prog_1', 'prog_2', false)).toBe('needs-confirm');
    });

    it('다른 프로그램 소속이어도 확인을 받았으면 ok', () => {
        expect(programMoveOutcome('prog_1', 'prog_2', true)).toBe('ok');
    });

    it('어디에도 안 속해 있으면 확인 없이 ok', () => {
        // 빼앗는 것이 아니라서 확인을 받을 상대가 없다. 초대 코드 없이 가입한
        // 멘티(User.programId = null)가 이 갈래를 탄다.
        expect(programMoveOutcome(null, 'prog_1', false)).toBe('ok');
        expect(programMoveOutcome(null, 'prog_1', true)).toBe('ok');
    });
});
