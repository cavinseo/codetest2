// 삭제 사유 판정과 사전 점검 문구가 규칙대로인지 확인하는 테스트입니다.
import { describe, expect, it } from 'vitest';
import {
    DELETION_REASONS,
    DELETION_REASON_LABELS,
    describeMenteeDeletion,
    parseDeletionReason,
    type MenteeDeletionPreview,
} from '../lib/account-deletion';

const EMPTY: MenteeDeletionPreview = { transferProjects: [], invitations: 0, migrations: 0, inviteCodes: 0 };

describe('parseDeletionReason', () => {
    it('정해진 세 사유만 받는다', () => {
        for (const reason of DELETION_REASONS) {
            expect(parseDeletionReason(reason)).toBe(reason);
        }
    });

    it('그 밖의 값은 전부 거부한다', () => {
        for (const value of ['', 'other', 'SELF_REQUEST', null, undefined, 0, {}, []]) {
            expect(parseDeletionReason(value)).toBeNull();
        }
    });

    it('세 사유를 빠짐없이 담는다', () => {
        // 사유가 늘거나 줄면 화면의 선택지와 서버 검증이 함께 움직여야 한다.
        expect(DELETION_REASONS).toEqual(['self_request', 'misregistration', 'retention_expired']);
    });

    it('모든 사유에 라벨이 있다', () => {
        for (const reason of DELETION_REASONS) {
            expect(DELETION_REASON_LABELS[reason]).toBeTruthy();
        }
    });
});

describe('describeMenteeDeletion', () => {
    it('아무 일도 없으면 빈 목록이다', () => {
        expect(describeMenteeDeletion(EMPTY)).toEqual([]);
    });

    it('이전될 프로젝트마다 받을 사람을 밝힌다', () => {
        const lines = describeMenteeDeletion({
            ...EMPTY,
            transferProjects: [{ id: 'p1', name: '스마트팜', managerName: '김매니저' }],
        });
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('스마트팜');
        expect(lines[0]).toContain('김매니저');
        expect(lines[0]).toContain('소유자');
    });

    it('프로젝트가 여럿이면 각각 한 줄씩 낸다', () => {
        const lines = describeMenteeDeletion({
            ...EMPTY,
            transferProjects: [
                { id: 'p1', name: '가', managerName: '김매니저' },
                { id: 'p2', name: '나', managerName: '이매니저' },
            ],
        });
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('가');
        expect(lines[1]).toContain('나');
    });

    it('매니저 이름이 없어도 문장이 깨지지 않는다', () => {
        // User.name 은 nullable 이다. null 이 그대로 문장에 박히면 안 된다.
        const lines = describeMenteeDeletion({
            ...EMPTY,
            transferProjects: [{ id: 'p1', name: '스마트팜', managerName: null }],
        });
        expect(lines[0]).toContain('프로그램 매니저');
        expect(lines[0]).not.toContain('null');
        expect(lines[0]).not.toContain('undefined');
    });

    it('매니저 이름이 공백뿐이어도 역할 이름으로 대신한다', () => {
        // 빈 이름이 그대로 들어가면 "소유자가  로 바뀝니다" 가 된다.
        const lines = describeMenteeDeletion({
            ...EMPTY,
            transferProjects: [{ id: 'p1', name: '스마트팜', managerName: '   ' }],
        });
        expect(lines[0]).toContain('프로그램 매니저');
    });

    it('이력은 남고 주인만 비워진다고 알린다', () => {
        const lines = describeMenteeDeletion({ ...EMPTY, invitations: 3, migrations: 2 });
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('설문 초대 3건');
        expect(lines[0]).toContain('남고');
        expect(lines[1]).toContain('엑셀 가져오기 이력 2건');
        expect(lines[1]).toContain('남고');
    });

    it('초대 코드는 삭제된다고 알린다', () => {
        const [line] = describeMenteeDeletion({ ...EMPTY, inviteCodes: 1 });
        expect(line).toContain('초대 코드 1건');
        expect(line).toContain('삭제');
    });

    it('0건인 항목은 말하지 않는다', () => {
        const lines = describeMenteeDeletion({ ...EMPTY, invitations: 0, migrations: 5, inviteCodes: 0 });
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('엑셀');
    });

    it('프로젝트 이전을 이력보다 먼저 말한다', () => {
        // 가장 크게 바뀌는 것이 소유권 이전이라 맨 앞에 온다.
        const lines = describeMenteeDeletion({
            ...EMPTY,
            transferProjects: [{ id: 'p1', name: '스마트팜', managerName: '김매니저' }],
            invitations: 1,
            migrations: 1,
            inviteCodes: 1,
        });
        expect(lines).toHaveLength(4);
        expect(lines[0]).toContain('스마트팜');
        expect(lines[1]).toContain('설문 초대');
        expect(lines[2]).toContain('엑셀');
        expect(lines[3]).toContain('초대 코드');
    });
});
