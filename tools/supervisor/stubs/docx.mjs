// docx v9 의 감리용 스텁. 이 컨테이너는 npm 레지스트리·CDN·GitHub 릴리스가 전부 막혀
// 진짜 docx 를 설치할 수 없다. 그래서 렌더러가 "실행된 적 없는 코드"로 병합되는 것을
// 막기 위해, export 이름을 v9 그대로 두고 생성자 인자만 기록하는 가짜를 만든다.
//
// 이 스텁이 증명하는 것: 렌더러가 import 하는 이름이 v9 에 존재한다(없으면 ESM link 에서
// 죽는다), 렌더러가 던지지 않고 끝까지 돈다, Document 에 넘긴 트리의 모양(행·셀·span).
// 증명하지 못하는 것: docx 가 그 인자를 받아 유효한 .docx 를 만드는지. 그건 로컬 게이트다.

function record(kind) {
    return class {
        constructor(options) {
            this.__kind = kind;
            this.options = typeof options === 'string' ? { text: options } : (options ?? {});
        }
    };
}

export const Document = record('Document');
export const Paragraph = record('Paragraph');
export const TextRun = record('TextRun');
export const Table = record('Table');
export const TableRow = record('TableRow');
export const TableCell = record('TableCell');
export const Header = record('Header');
export const Footer = record('Footer');
export const PageBreak = record('PageBreak');
export const TableBorders = record('TableBorders');

export const AlignmentType = Object.freeze({
    START: 'start', CENTER: 'center', END: 'end', BOTH: 'both',
    LEFT: 'left', RIGHT: 'right', JUSTIFIED: 'both', DISTRIBUTE: 'distribute',
    MEDIUM_KASHIDA: 'mediumKashida', HIGH_KASHIDA: 'highKashida', LOW_KASHIDA: 'lowKashida',
    THAI_DISTRIBUTE: 'thaiDistribute', NUM_TAB: 'numTab',
});
export const WidthType = Object.freeze({ AUTO: 'auto', DXA: 'dxa', NIL: 'nil', PERCENTAGE: 'pct' });
export const VerticalAlign = Object.freeze({ BOTTOM: 'bottom', CENTER: 'center', TOP: 'top' });
export const PageOrientation = Object.freeze({ PORTRAIT: 'portrait', LANDSCAPE: 'landscape' });
export const HeadingLevel = Object.freeze({
    HEADING_1: 'Heading1', HEADING_2: 'Heading2', HEADING_3: 'Heading3',
    HEADING_4: 'Heading4', HEADING_5: 'Heading5', HEADING_6: 'Heading6', TITLE: 'Title',
});
export const BorderStyle = Object.freeze({ SINGLE: 'single', NONE: 'none', NIL: 'nil', DOUBLE: 'double', DASHED: 'dashed' });
export const ShadingType = Object.freeze({ CLEAR: 'clear', SOLID: 'solid', PERCENT_50: 'pct50' });
export const TableLayoutType = Object.freeze({ AUTOFIT: 'autofit', FIXED: 'fixed' });
export const SectionType = Object.freeze({ NEXT_PAGE: 'nextPage', CONTINUOUS: 'continuous' });
export const UnderlineType = Object.freeze({ SINGLE: 'single', NONE: 'none' });
export const PageNumber = Object.freeze({ CURRENT: 'CURRENT', TOTAL_PAGES: 'TOTAL_PAGES' });

export function convertMillimetersToTwip(mm) {
    return Math.floor((mm / 25.4) * 1440);
}
export function convertInchesToTwip(inches) {
    return Math.floor(inches * 1440);
}

// 마지막으로 만든 Document 를 감리 하네스가 꺼내 볼 수 있게 둔다.
export const __recorded = { lastDocument: null };

export const Packer = {
    async toBuffer(doc) {
        __recorded.lastDocument = doc;
        // ZIP 서명 + 트리 직렬화. 스모크 테스트의 "PK 로 시작·1000 바이트 초과" 를 형식상
        // 만족하지만, 그것이 진짜 .docx 임을 뜻하지는 않는다 — 로컬 게이트만이 그것을 본다.
        const body = Buffer.from(JSON.stringify(doc, null, 1), 'utf8');
        return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), body]);
    },
    async toBlob() {
        throw new Error('감리 스텁: toBlob 은 흉내 내지 않는다');
    },
    async toBase64String(doc) {
        return (await this.toBuffer(doc)).toString('base64');
    },
};
