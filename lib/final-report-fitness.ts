// 저장된 보고서를 바꾸지 않고 WS-4의 표 이외 영역을 출력에서 제외한다.
import type { FinalReportBlock } from './final-report-document';

export function getFitnessReportExcludedIndexes(blocks: FinalReportBlock[]): Set<number> {
    const excluded = new Set<number>();
    let inFitness = false;
    for (const [index, block] of blocks.entries()) {
        if (block.kind === 'heading') {
            if (/\bWS-4\b/.test(block.text) || block.text === '제품/서비스 속성 적합도') {
                inFitness = true;
                continue;
            }
            if (inFitness && ['제품/서비스 진단표', '제품/서비스 개선 방향'].includes(block.text)) {
                excluded.add(index);
                continue;
            }
            inFitness = false;
        }
        if (block.kind === 'pageBreak' || block.kind === 'cover') inFitness = false;
        if (!inFitness) continue;
        if (block.kind === 'image' && block.title === '제품/서비스 속성 적합도') continue;
        if (block.kind === 'paragraph' && block.text === '속성 적합도 행렬이 저장되어 있지 않습니다. 평가 결과 그림은 미작성 상태입니다.') continue;
        excluded.add(index);
    }
    return excluded;
}
