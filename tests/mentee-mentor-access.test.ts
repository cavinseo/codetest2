// 멘토의 편집 권한을 현재 멘티 배정으로만 결정하고 과거 멤버 권한 우회를 막는다.
import { expect, it, vi } from 'vitest';
vi.mock('../lib/prisma', () => ({ prisma: {} }));
import { isProjectWriteRole, resolveProjectRole } from '../lib/authorization';

it.each(['OWNER', 'EDITOR', 'COACH', 'ADMIN', undefined])('멘토의 기존 %s 역할로 배정 없는 접근을 허용하지 않는다', memberRole => {
    expect(resolveProjectRole({ systemRole: 'MENTOR', isOwner: memberRole === 'OWNER', memberRole, isAssignedMentor: false })).toBeUndefined();
});
it.each(['OWNER', 'EDITOR', 'COACH', 'ADMIN', undefined])('배정된 멘토는 기존 %s 역할에도 EDITOR만 받는다', memberRole => {
    const role = resolveProjectRole({ systemRole: 'MENTOR', isOwner: memberRole === 'OWNER', memberRole, isAssignedMentor: true });
    expect(role).toBe('EDITOR');
    expect(isProjectWriteRole(role!)).toBe(true);
});
it.each(['OWNER', 'EDITOR', 'COACH', 'ADMIN', undefined])('실제 멘토로 배정된 매니저는 기존 %s 역할에도 EDITOR만 받는다', memberRole => {
    expect(resolveProjectRole({ systemRole: 'PROGRAM_MANAGER', isOwner: false, memberRole, isAssignedMentor: true })).toBe('EDITOR');
});
it('일반 COACH는 배정 멘토의 편집 권한을 받지 않는다', () => {
    const role = resolveProjectRole({ systemRole: 'MENTEE', isOwner: false, memberRole: 'COACH' });
    expect(role).toBe('COACH');
    expect(isProjectWriteRole(role!)).toBe(false);
});
