// 승인 소비와 프로젝트 생성이 같은 잠금·트랜잭션 안에서 수행되는지 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), count: vi.fn(), consume: vi.fn(), create: vi.fn(), owner: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { $transaction: m.transaction } }));
import { createProjectWithApproval } from '../lib/project-creation-approval';
const data = { id: 'project', name: '프로젝트', ownerId: 'mentee', programId: 'program' };
beforeEach(() => {
    vi.resetAllMocks();
    m.count.mockResolvedValue(0);
    m.consume.mockResolvedValue({ count: 1 });
    m.create.mockResolvedValue(data);
    m.transaction.mockImplementation(callback => callback({ $queryRaw: m.lock, user: { findUnique: m.owner }, project: { count: m.count, create: m.create }, projectCreationRequest: { updateMany: m.consume } }));
});
it('첫 프로젝트는 승인 없이 만들되 먼저 소유자 행을 잠근다', async () => {
    expect(await createProjectWithApproval(data, true)).toEqual(data);
    expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.count.mock.invocationCallOrder[0]);
    expect(m.lock.mock.calls[0][1]).toBe('mentee');
    expect(m.lock.mock.calls[0][0].join('')).toContain('FOR UPDATE');
    expect(m.consume).not.toHaveBeenCalled();
});
it('두 번째 프로젝트는 승인 없으면 생성하지 않는다', async () => {
    m.count.mockResolvedValue(1);
    await expect(createProjectWithApproval(data, true)).rejects.toThrow('추가 프로젝트');
    expect(m.create).not.toHaveBeenCalled();
});
it('같은 멘티·프로그램의 미사용 승인만 한 번 소비한다', async () => {
    m.count.mockResolvedValue(2);
    await createProjectWithApproval(data, true, 'approval');
    expect(m.consume).toHaveBeenCalledWith({ where: { id: 'approval', menteeId: 'mentee', programId: 'program', status: 'APPROVED', usedAt: null }, data: { usedAt: expect.any(Date) } });
    expect(m.consume.mock.invocationCallOrder[0]).toBeLessThan(m.create.mock.invocationCallOrder[0]);
});
it('사용·반려·타인 승인 등 소비 실패 시 생성하지 않는다', async () => {
    m.count.mockResolvedValue(1);
    m.consume.mockResolvedValue({ count: 0 });
    await expect(createProjectWithApproval(data, true, 'invalid')).rejects.toThrow('승인');
    expect(m.create).not.toHaveBeenCalled();
});
it('관리자가 대신 개설할 때도 같은 멘티 행을 잠근다', async () => {
    await createProjectWithApproval(data, false);
    expect(m.lock).toHaveBeenCalled();
    expect(m.consume).not.toHaveBeenCalled();
});
it('생성 실패를 트랜잭션 밖에서 삼키지 않아 승인 소비도 롤백된다', async () => {
    m.count.mockResolvedValue(1);
    m.create.mockRejectedValue(new Error('DB failure'));
    await expect(createProjectWithApproval(data, true, 'approval')).rejects.toThrow('DB failure');
});

function assignedMentor() {
    m.lock.mockResolvedValueOnce([{ role: 'MENTOR', status: 'APPROVED', mentorProjectCreationEnabled: true }])
        .mockResolvedValueOnce([{ id: 'mentee' }])
        .mockResolvedValueOnce([{ mentorId: 'mentor' }]);
    m.owner.mockResolvedValue({ role: 'MENTEE', status: 'APPROVED', programId: 'program' });
}

it('활성 멘토가 현재 배정된 승인 멘티의 프로그램에 생성한다', async () => {
    assignedMentor();
    expect(await createProjectWithApproval(data, false, undefined, 'mentor')).toEqual(data);
    expect(m.lock.mock.calls.map((call) => call[1])).toEqual(['mentor', 'mentee', 'mentee']);
    expect(m.lock.mock.calls.every((call) => call[0].join('').includes('FOR UPDATE'))).toBe(true);
    expect(m.owner).toHaveBeenCalledWith({ where: { id: 'mentee' }, select: { role: true, programId: true, status: true } });
    expect(m.create).toHaveBeenCalledWith({ data });
});

it.each([
    null,
    { role: 'MENTEE', status: 'APPROVED', mentorProjectCreationEnabled: true },
    { role: 'MENTOR', status: 'PENDING', mentorProjectCreationEnabled: true },
    { role: 'MENTOR', status: 'APPROVED', mentorProjectCreationEnabled: false },
])('잠금 후 멘토 권한이 유효하지 않으면 생성하지 않는다 (%j)', async (mentor) => {
    m.lock.mockResolvedValueOnce(mentor ? [mentor] : []);
    await expect(createProjectWithApproval(data, false, undefined, 'mentor')).rejects.toThrow('사용중지');
    expect(m.owner).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
});

it.each([{ assignment: [] }, { assignment: [{ mentorId: 'other-mentor' }] }])('배정 해제나 다른 멘토로 변경된 경우 생성하지 않는다 (%j)', async ({ assignment }) => {
    assignedMentor();
    m.lock.mockReset().mockResolvedValueOnce([{ role: 'MENTOR', status: 'APPROVED', mentorProjectCreationEnabled: true }])
        .mockResolvedValueOnce([{ id: 'mentee' }]).mockResolvedValueOnce(assignment);
    await expect(createProjectWithApproval(data, false, undefined, 'mentor')).rejects.toThrow('현재 배정');
    expect(m.create).not.toHaveBeenCalled();
});

it.each([
    null,
    { role: 'MENTOR', status: 'APPROVED', programId: 'program' },
    { role: 'MENTEE', status: 'PENDING', programId: 'program' },
    { role: 'MENTEE', status: 'APPROVED', programId: 'other-program' },
])('잠금 후 멘티 자격 또는 프로그램이 변경되면 생성하지 않는다 (%j)', async (owner) => {
    assignedMentor();
    m.owner.mockResolvedValue(owner);
    await expect(createProjectWithApproval(data, false, undefined, 'mentor')).rejects.toThrow('현재 배정');
    expect(m.create).not.toHaveBeenCalled();
});
