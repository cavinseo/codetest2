// 프로젝트 삭제가 한 번의 확인으로 실행되지 않는지 확인한다.
//
// 여기서 지키는 성질은 하나다: 프로젝트는 stage 2 에 도달하지 않으면
// 절대 지워지지 않는다. 이 성질이 깨지면 관리자가 목록에서 삭제를 한 번
// 누른 것만으로 프로젝트와 하위 22개 모델이 사라진다.
import { describe, expect, it } from 'vitest';
import {
    deleteActionFor, cancelGoesBack, totalDeleteStages,
    type DeleteConfirmState, type DeleteStage,
} from '../lib/delete-confirmation';

const STAGES: DeleteStage[] = [1, 2];

describe('deleteActionFor', () => {
    it('프로젝트는 1단계에서 지우지 않고 한 번 더 묻는다', () => {
        expect(deleteActionFor({ type: 'project', stage: 1 })).toBe('advance');
    });

    it('프로젝트는 2단계에서만 지운다', () => {
        expect(deleteActionFor({ type: 'project', stage: 2 })).toBe('delete');
    });

    it('프로젝트를 지우는 단계는 2단계뿐이다', () => {
        // 단계를 늘리거나 순서를 바꿔도 1단계에서 삭제가 새지 않아야 한다.
        const deleting = STAGES.filter(
            (stage) => deleteActionFor({ type: 'project', stage }) === 'delete'
        );
        expect(deleting).toEqual([2]);
    });

    it('사용자는 서버 409 가 되물어보므로 화면에서 단계를 늘리지 않는다', () => {
        for (const stage of STAGES) {
            expect(deleteActionFor({ type: 'user', stage })).toBe('delete');
        }
    });
});

describe('totalDeleteStages', () => {
    it('프로젝트는 두 단계를 거친다', () => {
        expect(totalDeleteStages('project')).toBe(2);
    });

    it('사용자는 한 단계다', () => {
        expect(totalDeleteStages('user')).toBe(1);
    });
});

describe('cancelGoesBack', () => {
    it('마지막 확인에서는 앞 단계로 돌아간다', () => {
        expect(cancelGoesBack({ type: 'project', stage: 2 })).toBe(true);
    });

    it('첫 단계에서는 창을 닫는다', () => {
        expect(cancelGoesBack({ type: 'project', stage: 1 })).toBe(false);
        expect(cancelGoesBack({ type: 'user', stage: 1 })).toBe(false);
    });
});

describe('두 단계를 실제로 밟아본다', () => {
    it('삭제 버튼을 두 번 눌러야 프로젝트가 지워진다', () => {
        let state: DeleteConfirmState = { type: 'project', stage: 1 };
        const actions: string[] = [];

        // 첫 번째 클릭
        let action = deleteActionFor(state);
        actions.push(action);
        if (action === 'advance') state = { ...state, stage: 2 };

        // 두 번째 클릭
        action = deleteActionFor(state);
        actions.push(action);

        expect(actions).toEqual(['advance', 'delete']);
    });
});
