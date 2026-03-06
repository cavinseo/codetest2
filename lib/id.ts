import { randomUUID } from 'crypto';

/**
 * 엔티티 타입별 접두사가 붙은 고유 ID를 생성합니다.
 * crypto.randomUUID() 기반으로 충돌 가능성이 없습니다.
 *
 * @param prefix - 엔티티 종류를 나타내는 접두사
 * @returns 'prefix_<16자 랜덤 hex>' 형태의 고유 문자열
 */
export function generateId(
    prefix: 'user' | 'proj' | 'member' | 'response' | 'inv' | 'spec' | 'attr' | 'fitness' | 'rel' | 'corr' | 'bm' | 'tech'
): string {
    // UUID의 하이픈을 제거한 뒤 앞 16자만 사용 (충분한 엔트로피 유지)
    const shortUuid = randomUUID().replace(/-/g, '').slice(0, 16);
    return `${prefix}_${shortUuid}`;
}
