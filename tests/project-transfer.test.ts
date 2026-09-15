// 프로젝트 이관의 미리보기 검증과 변경 범위를 검사한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { executeProjectTransfer, getProjectTransferPreview, lockTransferUsers } from '../lib/project-transfer';

const person = (id: string, role = 'MENTEE') => ({ id, name: id, email: `${id}@example.com`, role, status: 'APPROVED', accessExpiresAt: null, updatedAt: new Date('2026-01-01'), program: { id: `program-${id}`, name: `프로그램 ${id}` }, mentorAssignment: null as null | { mentorId: string; assignedAt: Date; mentor: ReturnType<typeof mentor> } });
const mentor = (id: string) => ({ id, name: id, email: `${id}@example.com`, role: 'MENTOR', status: 'APPROVED', accessExpiresAt: null as Date | null, updatedAt: new Date('2026-01-01') });
let source: ReturnType<typeof person>;
let target: ReturnType<typeof person>;
let project: { id: string; name: string; ownerId: string; programId: string; updatedAt: Date; program: { id: string; name: string }; owner: ReturnType<typeof person> };
const db = {
    $queryRaw: vi.fn(),
    project: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    mentorAssignment: { upsert: vi.fn() },
    projectMember: { deleteMany: vi.fn() },
};
const tx = db as unknown as Prisma.TransactionClient;

beforeEach(() => {
    vi.resetAllMocks();
    source = person('source');
    target = person('target');
    source.mentorAssignment = { mentorId: 'mentor-a', assignedAt: new Date('2026-01-01'), mentor: mentor('mentor-a') };
    target.mentorAssignment = { mentorId: 'mentor-b', assignedAt: new Date('2026-01-01'), mentor: mentor('mentor-b') };
    project = { id: 'project', name: '기존 프로젝트', ownerId: source.id, programId: source.program.id, updatedAt: new Date('2026-01-01'), program: source.program, owner: source };
    db.project.findUnique.mockImplementation(async () => project);
    db.user.findUnique.mockImplementation(async () => target);
    db.project.findMany.mockResolvedValue([{ id: 'target-project' }]);
    db.project.updateMany.mockResolvedValue({ count: 1 });
    db.$queryRaw.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('프로젝트 강제 이관', () => {
    it('다른 프로그램과 대상의 기존 프로젝트에 미치는 멘토 영향을 미리 보여 준다', async () => {
        const preview = await getProjectTransferPreview(tx, 'project', 'target');
        expect(preview).toMatchObject({ targetProjectCount: 1, programChanged: true, mentorChanged: true, sourceMentor: { id: 'mentor-a' }, currentTargetMentor: { id: 'mentor-b' }, nextMentor: { id: 'mentor-a' } });
        expect(preview.previewToken).toMatch(/^[a-f0-9]{64}$/);
        expect(db.project.updateMany).not.toHaveBeenCalled();
    });

    it('소유자와 프로그램만 변경하고 원본/대상 멤버만 제거한다', async () => {
        const preview = await getProjectTransferPreview(tx, 'project', 'target');
        await executeProjectTransfer(tx, 'project', 'target', preview.previewToken);
        expect(db.project.updateMany).toHaveBeenCalledWith({ where: { id: 'project', ownerId: 'source', programId: 'program-source', updatedAt: project.updatedAt }, data: { ownerId: 'target', programId: 'program-target' } });
        expect(db.projectMember.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'project', userId: { in: ['source', 'target'] } } });
        expect(db.mentorAssignment.upsert).toHaveBeenCalledWith({ where: { menteeId: 'target' }, create: { menteeId: 'target', mentorId: 'mentor-a' }, update: { mentorId: 'mentor-a', assignedAt: expect.any(Date) } });
    });

    it.each(['없음', '동일'])('원본 멘토가 %s이면 대상 배정을 쓰지 않는다', async situation => {
        source.mentorAssignment = situation === '없음' ? null : target.mentorAssignment;
        const preview = await getProjectTransferPreview(tx, 'project', 'target');
        expect(preview.mentorChanged).toBe(false);
        expect(preview.nextMentor?.id).toBe('mentor-b');
        await executeProjectTransfer(tx, 'project', 'target', preview.previewToken);
        expect(db.mentorAssignment.upsert).not.toHaveBeenCalled();
    });

    it.each([
        { role: 'MENTOR' }, { status: 'PENDING' }, { accessExpiresAt: new Date('2000-01-01') }, { program: null },
    ])('잘못된 대상 멘티를 거절한다. %j', async invalid => {
        Object.assign(target, invalid);
        await expect(getProjectTransferPreview(tx, 'project', 'target')).rejects.toMatchObject({ status: 400 });
    });

    it('같은 소유자로 이관할 수 없다', async () => {
        db.user.findUnique.mockResolvedValue(source);
        await expect(getProjectTransferPreview(tx, 'project', 'source')).rejects.toMatchObject({ status: 400 });
    });

    it.each([{ role: 'ADMIN' }, { status: 'PENDING' }, { accessExpiresAt: new Date('2000-01-01') }])('무효한 원본 멘토를 거절한다. %j', async invalid => {
        Object.assign(source.mentorAssignment!.mentor, invalid);
        await expect(getProjectTransferPreview(tx, 'project', 'target')).rejects.toMatchObject({ status: 400 });
    });

    it.each(['소유자', '대상 프로그램', '멘토', '대상 프로젝트', '대상 승인', '원본 이름'])('미리보기 뒤 %s 변경 시 아무것도 쓰지 않는다', async change => {
        const preview = await getProjectTransferPreview(tx, 'project', 'target');
        if (change === '소유자') project.ownerId = 'another';
        if (change === '대상 프로그램') target.program = { id: 'other-program', name: '다른 프로그램' };
        if (change === '멘토') source.mentorAssignment = null;
        if (change === '대상 프로젝트') db.project.findMany.mockResolvedValue([{ id: 'new-project' }]);
        if (change === '대상 승인') target.status = 'PENDING';
        if (change === '원본 이름') source.name = '변경된 이름';
        await expect(executeProjectTransfer(tx, 'project', 'target', preview.previewToken)).rejects.toMatchObject({ status: 409 });
        expect(db.project.updateMany).not.toHaveBeenCalled();
        expect(db.mentorAssignment.upsert).not.toHaveBeenCalled();
        expect(db.projectMember.deleteMany).not.toHaveBeenCalled();
    });

    it('조건부 소유자 변경 실패 시 나머지 쓰기를 진행하지 않는다', async () => {
        const preview = await getProjectTransferPreview(tx, 'project', 'target');
        db.project.updateMany.mockResolvedValue({ count: 0 });
        await expect(executeProjectTransfer(tx, 'project', 'target', preview.previewToken)).rejects.toMatchObject({ status: 409 });
        expect(db.mentorAssignment.upsert).not.toHaveBeenCalled();
    });

    it('미리보기 후 시간이 지나 멘토가 만료되면 다시 확인한다', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01'));
        source.mentorAssignment!.mentor.accessExpiresAt = new Date('2026-01-02');
        const preview = await getProjectTransferPreview(tx, 'project', 'target');
        vi.setSystemTime(new Date('2026-01-03'));
        await expect(executeProjectTransfer(tx, 'project', 'target', preview.previewToken)).rejects.toMatchObject({ status: 409 });
        expect(db.project.updateMany).not.toHaveBeenCalled();
    });

    it('공유 사용자 잠금은 중복을 제거하고 정렬한다', async () => {
        await lockTransferUsers(tx, ['z', 'a', 'z']);
        expect(db.$queryRaw.mock.calls[0][0].values).toEqual(['a', 'z']);
        expect(db.$queryRaw.mock.calls[0][0].sql).toContain('ORDER BY "id" FOR UPDATE');
    });
});
