// lib/authorization 자리. 이 저장소 테스트 17개가 이 모듈을 mock 한다.
import { forward } from './lazy.mjs';
export const requireProjectAccess = forward('lib/authorization', 'requireProjectAccess');
export const requireAdmin = forward('lib/authorization', 'requireAdmin');
export const resolveProjectRole = forward('lib/authorization', 'resolveProjectRole');
export const hasAdminAccess = forward('lib/authorization', 'hasAdminAccess');
