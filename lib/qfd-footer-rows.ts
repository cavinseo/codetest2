export type QfdSpecFooterRow =
    | { kind: 'unit'; key: string; specLabel: 'Spec'; rowLabel: '측정단위' }
    | { kind: 'self'; key: string; specLabel: null; rowLabel: '자사' }
    | { kind: 'competitor'; key: string; specLabel: null; rowLabel: string; company: string }
    | { kind: 'target'; key: string; specLabel: '설계 목표치'; rowLabel: null };

export function buildQfdSpecFooterRows(
    competitorCompanies: string[],
    getCompetitorLabel: (company: string) => string
): QfdSpecFooterRow[] {
    return [
        { kind: 'unit', key: 'unit', specLabel: 'Spec', rowLabel: '측정단위' },
        { kind: 'self', key: 'self', specLabel: null, rowLabel: '자사' },
        ...competitorCompanies.map((company) => ({
            kind: 'competitor' as const,
            key: `competitor-${company}`,
            specLabel: null,
            rowLabel: getCompetitorLabel(company),
            company,
        })),
        { kind: 'target', key: 'target', specLabel: '설계 목표치', rowLabel: null },
    ];
}
