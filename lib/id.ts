import { randomUUID } from 'crypto';

/**
 * 엔티티 타입별 접두사가 붙은 고유 ID를 생성합니다.
 * crypto.randomUUID() 기반으로 충돌 가능성이 없습니다.
 *
 * @param prefix - 엔티티 종류를 나타내는 접두사
 * @returns 'prefix_<16자 랜덤 hex>' 형태의 고유 문자열
 */
export function generateId(
    // 'bm' 은 요구사항 × 회사 벤치마크, 'techbm' 은 기술특성 × 회사 벤치마크다.
    // 축이 다른 두 테이블이라 접두사도 갈라 둔다 — 로그에서 id 만 보고도 구분된다.
    prefix: 'user' | 'proj' | 'prog' | 'member' | 'response' | 'inv' | 'invite' | 'spec' | 'attr' | 'fitness' | 'rel' | 'corr' | 'bm' | 'techbm' | 'tech'
): string {
    // UUID의 하이픈을 제거한 뒤 앞 16자만 사용 (충분한 엔트로피 유지)
    const shortUuid = randomUUID().replace(/-/g, '').slice(0, 16);
    return `${prefix}_${shortUuid}`;
}
