// 기존 보고서의 이름과 교정 내용을 보존하면서 출력용 이름 라벨을 통일한다.
import type { FinalReportBlock } from './final-report-document';

export function normalizeReportNameLabels(blocks: FinalReportBlock[]): FinalReportBlock[] {
    return blocks.map(block => {
        if (block.kind !== 'paragraph') return block;
        const text = block.text
            .replace(/^프로젝트명[ \t]*[·:][ \t]*/gm, '프로젝트명 : ')
            .replace(/^(?:워크시트 제품명|제품명|제품\(서비스\)[ \t]*명)[ \t]*[·:][ \t]*/gm, '제품(서비스) 명 : ');
        return text === block.text ? block : { ...block, text };
    });
}
