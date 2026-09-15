// WS-9 최초 구성과 세부기능 선택에 쓰는 WS-10 세부스펙의 빈 값과 중복을 정리한다.

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
