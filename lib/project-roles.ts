// 프로젝트 역할과 쓰기 권한 판정. 서버(lib/authorization)와 화면이 같은 기준을 쓰도록
// next/server·prisma 에 기대지 않는 별도 모듈로 둔다.
//
// 화면 세 곳과 Kano 오프라인 설문 라우트가 ['OWNER','EDITOR','ADMIN'] 를 각자 다시 적고
// 있었다(2026-10-25 코드 리뷰 D4). 서버 판정만 바뀌면 화면은 편집을 열어 두고 저장에서
// 403 이 나는 어긋남이 생긴다.

export type ProjectAccessRole = 'OWNER' | 'EDITOR' | 'COACH' | 'ADMIN' | 'VIEWER';

const WRITE_ROLES = new Set<string>(['OWNER', 'EDITOR', 'ADMIN'] satisfies ProjectAccessRole[]);

/**
 * 이 역할로 프로젝트에 쓸 수 있는가. 화면은 API 가 준 문자열(없을 수도 있음)을 그대로
 * 넘기므로 넓은 타입을 받는다.
 */
export function isProjectWriteRole(role: string | null | undefined): boolean {
    return typeof role === 'string' && WRITE_ROLES.has(role);
}
