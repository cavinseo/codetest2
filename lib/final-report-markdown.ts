// Markdown과 안전한 HTML을 보고서에서 페이지 분할 가능한 문단·표·인라인 서식으로 변환한다.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import type { Element, Root, RootContent } from 'hast';
import { markdownSchema } from './markdown-schema';

export interface ReportTextRun {
    text: string;
    bold?: boolean;
    italic?: boolean;
    strike?: boolean;
    code?: boolean;
    href?: string;
}
export type ReportMarkdownBlock =
    | { kind: 'paragraph'; runs: ReportTextRun[]; depth: number; headingLevel?: number; marker?: string; quote?: boolean; code?: boolean }
    | { kind: 'table'; headers: ReportTextRun[][]; rows: ReportTextRun[][][]; columns: number };

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw).use(rehypeSanitize, markdownSchema);
const richSyntax = new Set(['heading', 'strong', 'emphasis', 'delete', 'inlineCode', 'code', 'link', 'linkReference', 'image', 'html', 'table', 'blockquote', 'thematicBreak']);
interface MarkdownNode { type: string; checked?: boolean | null; children?: MarkdownNode[] }
function hasRichSyntax(node: MarkdownNode): boolean {
    return richSyntax.has(node.type) || typeof node.checked === 'boolean' || Boolean(node.children?.some(hasRichSyntax));
}

function inlineRuns(node: RootContent, style: Omit<ReportTextRun, 'text'> = {}): ReportTextRun[] {
    if (node.type === 'text') return [{ ...style, text: node.value }];
    if (node.type !== 'element') return [];
    const tag = node.tagName;
    if (tag === 'br') return [{ ...style, text: '\n' }];
    if (tag === 'input') return [{ ...style, text: node.properties.checked ? '☑ ' : '☐ ' }];
    if (tag === 'img') return [{ ...style, text: String(node.properties.alt || '이미지'), href: typeof node.properties.src === 'string' ? node.properties.src : undefined }];
    const next = { ...style,
        ...(['strong', 'b'].includes(tag) ? { bold: true } : {}),
        ...(['em', 'i'].includes(tag) ? { italic: true } : {}),
        ...(['del', 's', 'strike'].includes(tag) ? { strike: true } : {}),
        ...(tag === 'code' ? { code: true } : {}),
        ...(tag === 'a' && typeof node.properties.href === 'string' ? { href: node.properties.href } : {}),
    };
    return node.children.flatMap(child => inlineRuns(child, next));
}

function tableRows(node: Element): Element[] {
    return node.children.flatMap(child => child.type !== 'element' ? [] : child.tagName === 'tr' ? [child] : tableRows(child));
}

// 일반 문장과 기존 글머리만 있는 본문은 기존 배치를 유지해 빈 줄·기호·들여쓰기를 보존한다.
export function parseReportMarkdown(source: string, force = false): ReportMarkdownBlock[] | null {
    const text = source.startsWith('시장정의 · ') && source.includes('\n목표고객 · ')
        ? source.replace(/^시장정의 · /, '시장정의\n\n').replace(/\n목표고객 · /, '\n\n목표고객 · ')
        : source;
    const parsed = processor.parse(text);
    if (!force && !hasRichSyntax(parsed)) return null;
    const tree = processor.runSync(parsed) as Root;
    const blocks: ReportMarkdownBlock[] = [];
    interface Context { depth: number; listDepth: number; quote?: boolean }
    function walk(nodes: RootContent[], context: Context) {
        let pending: ReportTextRun[] = [];
        function flush() {
            if (pending.some(run => run.text.trim())) blocks.push({ kind: 'paragraph', runs: pending, depth: context.depth, quote: context.quote });
            pending = [];
        }
        for (const node of nodes) {
            if (node.type !== 'element') { pending.push(...inlineRuns(node)); continue; }
            const tag = node.tagName;
            if (!['p', 'div', 'section', 'article', 'ul', 'ol', 'blockquote', 'pre', 'table', 'hr'].includes(tag) && !/^h[1-6]$/.test(tag)) {
                pending.push(...inlineRuns(node)); continue;
            }
            flush();
            if (tag === 'ul' || tag === 'ol') {
                const items = node.children.filter((child): child is Element => child.type === 'element' && child.tagName === 'li');
                items.forEach((item, index) => {
                    const start = blocks.length;
                    walk(item.children, { ...context, depth: context.listDepth, listDepth: context.listDepth + 1 });
                    const first = blocks[start];
                    if (first?.kind === 'paragraph') first.marker = tag === 'ol' ? `${Number(node.properties.start ?? 1) + index}.` : '•';
                });
            } else if (tag === 'table') {
                const rows = tableRows(node).map(row => row.children.filter((cell): cell is Element => cell.type === 'element' && ['th', 'td'].includes(cell.tagName)));
                if (!rows.length) continue;
                const columns = Math.max(...rows.map(row => row.length));
                if (!columns) continue;
                const cells = rows.map(row => Array.from({ length: columns }, (_, column) => row[column] ? inlineRuns(row[column]) : []));
                const headers = rows[0].some(cell => cell.tagName === 'th') ? cells.shift()! : [];
                blocks.push({ kind: 'table', headers, rows: cells, columns });
            } else if (tag === 'blockquote') {
                walk(node.children, { ...context, quote: true });
            } else if (tag === 'div' || tag === 'section' || tag === 'article') {
                walk(node.children, context);
            } else if (tag === 'hr') {
                blocks.push({ kind: 'paragraph', depth: context.depth, runs: [{ text: '────────────────────' }] });
            } else {
                let runs = inlineRuns(node);
                if (tag === 'pre') {
                    runs = runs.map(run => ({ ...run, code: true }));
                    const last = runs.at(-1);
                    if (last?.text.endsWith('\n')) last.text = last.text.slice(0, -1);
                }
                blocks.push({ kind: 'paragraph', runs, depth: context.depth, quote: context.quote,
                    ...(tag === 'pre' ? { code: true } : {}), ...(/^h[1-6]$/.test(tag) ? { headingLevel: Number(tag[1]) } : {}) });
            }
        }
        flush();
    }
    walk(tree.children, { depth: 0, listDepth: 0 });
    return blocks;
}

export const reportRunsText = (runs: ReportTextRun[]) => runs.map(run => run.text).join('');
