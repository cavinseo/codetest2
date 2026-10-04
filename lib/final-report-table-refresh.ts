// 기존 보고서의 문단과 그림을 보존하면서 사용자가 요청한 워크시트 표만 갱신한다.
import type { FinalReportBlock, FinalReportModel } from './final-report-document';
import { normalizeReportLabels } from './final-report-labels';

function tableKey(title: string): string | null {
    const number = title.match(/\bWS-(\d+)\b/)?.[1];
    if (!number) return null;
    if (title.includes('핵심자산 및 보완자산')) return 'assets-combined';
    if (title.includes('자금소요계획')) return 'ws-15';
    if (title.includes('자금조달계획')) return 'ws-16';
    if (number === '1') return title.includes('향후') ? 'sales-future' : 'sales-current';
    if (number === '3') return title.includes('기술 역량') ? 'capabilities' : 'attributes';
    if (number === '9') return title.includes('경쟁적 우위') ? 'competitive' : 'qfd';
    if (number === '11') return title.includes('개선 기능') ? 'improvement-features' : 'improvement-needs';
    if (number === '14') return title.includes('보완자산') ? 'assets-complementary' : 'assets-core';
    return `ws-${number}`;
}

function blockTableKey(block: FinalReportBlock): string | null {
    if (block.kind === 'dataTable') return tableKey(block.title ?? '');
    if (block.kind === 'image') return block.title === '제품/서비스 속성 적합도' ? 'ws-4' : block.title === '고객수요기반 기술스펙 관계도' ? 'qfd' : null;
    if (block.kind !== 'paragraph' || block.tone !== 'notice') return null;
    if (block.text.endsWith('의 저장 내용이 없습니다. 미작성 상태입니다.')) return tableKey(block.text);
    if (block.text === '속성 적합도 행렬이 저장되어 있지 않습니다. 평가 결과 그림은 미작성 상태입니다.') return 'ws-4';
    if (['QFD 관계도에 필요한 고객요구사항이 없습니다.', 'QFD 관계도에 필요한 기술특성 또는 고객요구사항이 없습니다.'].includes(block.text)) return 'qfd';
    return null;
}

export function refreshWorksheetTables(current: FinalReportModel, generated: FinalReportModel): FinalReportModel {
    const replacements = new Map<string, FinalReportBlock[]>();
    for (const block of generated.blocks) {
        const key = blockTableKey(block);
        if (key) replacements.set(key, [...(replacements.get(key) ?? []), block]);
    }
    const replaced = new Set<string>();
    const blocks = normalizeReportLabels(current.blocks).flatMap(block => {
        if (replacements.has('qfd') && ((block.kind === 'heading' && block.text === 'QFD 기술특성 목록 (WS-9)') || (block.kind === 'paragraph' && block.tone === 'caption' && block.text === '강한 관계 9 · 보통 관계 3 · 약한 관계 1 · 공란은 관계값 미저장. 기술 코드는 다음 목록과 대응합니다.'))) return [];
        const key = blockTableKey(block);
        if (key === 'assets-combined' && replacements.has('assets-core') && replacements.has('assets-complementary')) return ['assets-core', 'assets-complementary'].flatMap(assetKey => {
            if (replaced.has(assetKey)) return [];
            replaced.add(assetKey);
            return replacements.get(assetKey) ?? [];
        });
        if (!key || !replacements.has(key)) return [block];
        if (replaced.has(key)) return [];
        replaced.add(key);
        return replacements.get(key)!;
    });
    return { ...current, blocks };
}
