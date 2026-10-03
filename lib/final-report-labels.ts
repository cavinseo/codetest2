// 기존 보고서의 교정 내용을 보존하면서 이름 라벨과 워크시트 표시 번호를 통일한다.
import type { FinalReportBlock } from './final-report-document';

const renumberedWorksheets = [
    { title: '핵심자산 및 보완자산', previous: 15, current: 14 },
    { title: '자금소요계획', previous: 16, current: 15 },
    { title: '자금조달계획', previous: 17, current: 16 },
];

function normalizeWorksheetTitle(title: string): string {
    const worksheet = renumberedWorksheets.find(item => title.includes(item.title));
    return worksheet ? title.replace(new RegExp(`\\bWS-${worksheet.previous}\\b`, 'g'), `WS-${worksheet.current}`) : title;
}

export function normalizeReportLabels(blocks: FinalReportBlock[]): FinalReportBlock[] {
    let worksheet: typeof renumberedWorksheets[number] | undefined;
    return blocks.map(block => {
        if (block.kind === 'heading') {
            worksheet = renumberedWorksheets.find(item => block.text.includes(item.title));
            const text = normalizeWorksheetTitle(block.text);
            return text === block.text ? block : { ...block, text };
        }
        if (block.kind === 'cover' || block.kind === 'pageBreak') worksheet = undefined;
        if (block.kind === 'dataTable' && block.title) {
            const title = normalizeWorksheetTitle(block.title);
            return title === block.title ? block : { ...block, title };
        }
        if (block.kind !== 'paragraph') return block;
        let text = block.text
            .replace(/^프로젝트명[ \t]*[·:][ \t]*/gm, '프로젝트명 : ')
            .replace(/^(?:워크시트 제품명|제품명|제품\(서비스\)[ \t]*명)[ \t]*[·:][ \t]*/gm, '제품(서비스) 명 : ');
        if (worksheet && block.tone === 'analysis' && text === `WS-${worksheet.previous} 멘토 분석(보고)`) {
            text = `WS-${worksheet.current} 멘토 분석(보고)`;
        }
        return text === block.text ? block : { ...block, text };
    });
}
