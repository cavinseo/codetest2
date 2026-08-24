import { describe, expect, it } from 'vitest';
import { collectMentors, groupProjectsByProgram } from '../lib/affiliation';

const PROGRAM_A = { id: 'prog_a', name: '프로그램 A', organization: '가나기술원', startsAt: '2026-09-01', endsAt: '2027-02-28' };
const PROGRAM_B = { id: 'prog_b', name: '프로그램 B', organization: '다라진흥원', startsAt: '2026-01-01', endsAt: '2026-06-30' };

function row(projectId: string, projectName: string, program: typeof PROGRAM_A) {
    return { project: { id: projectId, name: projectName, program } };
}

describe('groupProjectsByProgram', () => {
    it('같은 프로그램의 프로젝트를 하나로 묶는다', () => {
        const result = groupProjectsByProgram([
            row('p1', '프로젝트1', PROGRAM_A),
            row('p2', '프로젝트2', PROGRAM_A),
        ]);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('prog_a');
        expect(result[0].projects.map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('프로그램이 다르면 따로 담는다', () => {
        const result = groupProjectsByProgram([
            row('p1', '프로젝트1', PROGRAM_A),
            row('p2', '프로젝트2', PROGRAM_B),
        ]);

        expect(result.map((g) => g.id)).toEqual(['prog_a', 'prog_b']);
        expect(result[0].projects).toHaveLength(1);
        expect(result[1].projects).toHaveLength(1);
    });

    it('프로그램이 번갈아 나와도 각각 하나로만 묶는다', () => {
        // 쿼리 정렬이 바뀌어 섞여 들어와도 프로그램이 중복 표시되면 안 된다.
        const result = groupProjectsByProgram([
            row('p1', '프로젝트1', PROGRAM_A),
            row('p2', '프로젝트2', PROGRAM_B),
            row('p3', '프로젝트3', PROGRAM_A),
        ]);

        expect(result).toHaveLength(2);
        expect(result[0].projects.map((p) => p.id)).toEqual(['p1', 'p3']);
        expect(result[1].projects.map((p) => p.id)).toEqual(['p2']);
    });

    it('프로그램의 표시 항목을 그대로 옮긴다', () => {
        const result = groupProjectsByProgram([row('p1', '프로젝트1', PROGRAM_A)]);

        expect(result[0]).toMatchObject({
            name: '프로그램 A', organization: '가나기술원',
            startsAt: '2026-09-01', endsAt: '2027-02-28',
        });
    });

    it('프로젝트 안에 program 을 남기지 않는다', () => {
        // 묶고 나면 program 은 바깥에 있다. 안에도 남으면 같은 값이 두 벌이 된다.
        const result = groupProjectsByProgram([row('p1', '프로젝트1', PROGRAM_A)]);

        expect(result[0].projects[0]).not.toHaveProperty('program');
    });

    it('배정이 없으면 빈 배열이다', () => {
        expect(groupProjectsByProgram([])).toEqual([]);
    });
});

describe('collectMentors', () => {
    const kim = { id: 'u1', name: '김멘토', email: 'kim@x.com' };
    const lee = { id: 'u2', name: '이멘토', email: 'lee@x.com' };

    it('여러 프로젝트를 맡은 멘토를 한 번만 낸다', () => {
        const result = collectMentors([
            { name: '프로젝트1', members: [{ user: kim }] },
            { name: '프로젝트2', members: [{ user: kim }] },
        ]);

        expect(result).toHaveLength(1);
        expect(result[0].projectNames).toEqual(['프로젝트1', '프로젝트2']);
    });

    it('한 프로젝트에 멘토가 여럿이면 모두 낸다', () => {
        const result = collectMentors([
            { name: '프로젝트1', members: [{ user: kim }, { user: lee }] },
        ]);

        expect(result.map((m) => m.id)).toEqual(['u1', 'u2']);
    });

    it('이름과 이메일을 그대로 옮긴다', () => {
        const result = collectMentors([{ name: '프로젝트1', members: [{ user: kim }] }]);

        expect(result[0]).toMatchObject({ id: 'u1', name: '김멘토', email: 'kim@x.com' });
    });

    it('이름이 없는 계정도 담는다', () => {
        const result = collectMentors([
            { name: '프로젝트1', members: [{ user: { id: 'u3', name: null, email: 'no@x.com' } }] },
        ]);

        expect(result[0].name).toBeNull();
        expect(result[0].email).toBe('no@x.com');
    });

    it('배정된 멘토가 없으면 빈 배열이다', () => {
        expect(collectMentors([{ name: '프로젝트1', members: [] }])).toEqual([]);
        expect(collectMentors([])).toEqual([]);
    });
});
