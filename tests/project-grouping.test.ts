// 대시보드 프로그램별 보기의 묶음·순서 계약을 검증한다.
import { describe, expect, it } from 'vitest';
import { groupProjectsByProgram } from '../lib/project-grouping';

const project = (id: string, programId: string, programName: string) => ({ id, programId, programName });

describe('groupProjectsByProgram', () => {
    it('프로젝트를 프로그램별로 묶고 프로그램 이름 가나다순으로 정렬한다', () => {
        const groups = groupProjectsByProgram([
            project('p1', 'prog_b', '하반기 과정'),
            project('p2', 'prog_a', '가을 창업반'),
            project('p3', 'prog_b', '하반기 과정'),
        ]);
        expect(groups).toEqual([
            { programId: 'prog_a', programName: '가을 창업반', projects: [project('p2', 'prog_a', '가을 창업반')] },
            {
                programId: 'prog_b', programName: '하반기 과정',
                projects: [project('p1', 'prog_b', '하반기 과정'), project('p3', 'prog_b', '하반기 과정')],
            },
        ]);
    });

    it('이름이 같아도 다른 프로그램이면 따로 묶는다', () => {
        // 기관마다 같은 과정명을 쓸 수 있어 이름이 아니라 programId 로 구분한다.
        const groups = groupProjectsByProgram([project('p1', 'prog_a', '창업반'), project('p2', 'prog_b', '창업반')]);
        expect(groups.map(group => group.programId)).toEqual(['prog_a', 'prog_b']);
    });

    it('묶음 안에서는 입력 순서를 지킨다', () => {
        const groups = groupProjectsByProgram([
            project('recent', 'prog_a', '창업반'),
            project('older', 'prog_a', '창업반'),
        ]);
        expect(groups[0].projects.map(item => item.id)).toEqual(['recent', 'older']);
    });

    it('프로젝트가 없으면 빈 목록이다', () => {
        expect(groupProjectsByProgram([])).toEqual([]);
    });
});
