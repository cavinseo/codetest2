// 화면과 서버가 함께 쓰는 쓰기 권한 판정(2026-10-25 코드 리뷰 D4).
import { expect, it } from 'vitest';
import { isProjectWriteRole } from '../lib/project-roles';
import { isProjectWriteRole as serverIsProjectWriteRole } from '../lib/authorization';

it.each(['OWNER', 'EDITOR', 'ADMIN'])('%s 는 쓸 수 있다', (role) => {
    expect(isProjectWriteRole(role)).toBe(true);
});

it.each(['COACH', 'VIEWER', 'owner', '', null, undefined])('%s 는 쓸 수 없다', (role) => {
    expect(isProjectWriteRole(role)).toBe(false);
});

it('서버 판정(lib/authorization)은 같은 함수다', () => {
    expect(serverIsProjectWriteRole).toBe(isProjectWriteRole);
});
