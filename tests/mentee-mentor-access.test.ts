// 멘토의 과거 멤버 권한이 멘티 배정과 조회 전용 정책을 우회하지 못하게 한다.
import { expect, it, vi } from 'vitest';
vi.mock('../lib/prisma', () => ({ prisma: {} }));
import { resolveProjectRole } from '../lib/authorization';

it.each(['OWNER', 'EDITOR', 'COACH', 'ADMIN', undefined])('멘토의 기존 %s 역할로 배정 없는 접근을 허용하지 않는다', memberRole => {
    expect(resolveProjectRole({ systemRole: 'MENTOR', isOwner: memberRole === 'OWNER', memberRole, isAssignedMentor: false })).toBeUndefined();
});
it.each(['OWNER', 'EDITOR', 'ADMIN', undefined])('배정된 멘토는 기존 %s 역할에도 COACH만 받는다', memberRole => {
    expect(resolveProjectRole({ systemRole: 'MENTOR', isOwner: memberRole === 'OWNER', memberRole, isAssignedMentor: true })).toBe('COACH');
});
