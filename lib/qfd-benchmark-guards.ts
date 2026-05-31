export type BenchmarkDeleteScope =
    | { mode: 'all'; company: null }
    | { mode: 'company'; company: string }
    | { mode: 'invalid'; company: null; error: string };

export function resolveBenchmarkDeleteScope(searchParams: URLSearchParams): BenchmarkDeleteScope {
    if (!searchParams.has('company')) {
        return { mode: 'all', company: null };
    }

    const company = searchParams.get('company')?.trim() ?? '';
    if (!company) {
        return { mode: 'invalid', company: null, error: '삭제할 경쟁사명이 필요합니다.' };
    }
    if (company === 'self') {
        return { mode: 'invalid', company: null, error: '자사 열은 삭제할 수 없습니다.' };
    }

    return { mode: 'company', company };
}
