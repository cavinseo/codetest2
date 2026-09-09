// WS-9(QFD) 기술특성 열의 세부기능은 WS-10(기능기술체계도)의 세부스펙에서 자동으로
// 채운다 — 사용자가 하나씩 골라 넣지 않아도 빈칸이 남지 않아야 한다. 핵심기능별로
// 나눠 고르던 방식은 당분간 쓰지 않으므로 세부스펙 이름을 그대로 옮기기만 한다.

/** 빈 값과 중복을 걸러내고 먼저 나온 순서를 그대로 유지한다. */
export function dedupeNonBlank(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of values) {
        const value = (raw ?? '').trim();
        if (!value || seen.has(value)) continue;
        seen.add(value);
        result.push(value);
    }
    return result;
}

/** WS-10 세부스펙 중 아직 WS-9 기술특성 이름으로 없는 것만 골라낸다. */
export function findMissingTechnicalCharNames(
    subSpecNames: string[],
    existingNames: Array<string | null | undefined>
): string[] {
    const existing = new Set(
        existingNames.map((name) => (name ?? '').trim()).filter(Boolean)
    );
    return subSpecNames.filter((name) => !existing.has(name));
}
