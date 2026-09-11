// 업로드가 기존 데이터를 덮어쓸지 덧붙일지 정하는 정책이다.
//
// 판정을 한 곳에 두는 이유: 예전에는 같은 이름의 parseWritePolicy 가 세 곳에
// 따로 있었고 기본값이 서로 반대였다(kano 는 append, 스펙·워크시트 업로드는
// replace). 그래서 writePolicy 필드가 빠지거나 'Replace' 처럼 대소문자가 틀린
// 같은 실수가 한쪽에서는 무해하고 다른 쪽에서는 워크시트를 통째로 지웠다.
export type WritePolicy = 'append' | 'replace';

/**
 * 알아볼 수 없는 값은 덧붙이기로 본다. 화면은 모두 writePolicy 를 명시해서
 * 보내므로 이 기본값이 쓰이는 경우는 요청이 잘못됐을 때뿐이고, 그때는 지우는
 * 쪽보다 덧붙이는 쪽이 안전하다 — 덧붙인 것은 지울 수 있지만 지운 것은
 * 되돌릴 수 없다.
 */
export function parseWritePolicy(rawValue: FormDataEntryValue | null): WritePolicy {
    return rawValue === 'replace' ? 'replace' : 'append';
}
