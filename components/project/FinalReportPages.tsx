'use client';
// 샘플과 같은 표지와 A4 페이지를 표시하고 원본 보고서 블록의 교정을 연결한다.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { FinalReportBlock } from '@/lib/final-report-document';
import type { BlockEdit } from '@/lib/final-report-edit';
import { worksheetImageFileName } from '@/lib/worksheet-capture';
import { layoutReportPages, reportCoverElements, reportOutputDate, REPORT_CHAPTER_PADDING, REPORT_BOX, REPORT_PAPER, type CoverBlock, type ReportLayoutItem, type ReportPageLayout } from '@/lib/final-report-layout';
import { getTableMergeSpans } from '@/lib/final-report-table-merge';
import type { ReportTextRun } from '@/lib/final-report-markdown';
import { normalizeReportLabels } from '@/lib/final-report-labels';
import { reportColumnSpans } from '@/lib/final-report-table-structure';

interface Props { blocks: FinalReportBlock[]; onEdit?: (edit: BlockEdit) => void; readOnly?: boolean; disabled?: boolean }
interface EditTarget { label: string; value: string; edit: BlockEdit; ariaLabel?: string }
type RequestEdit = (target: EditTarget) => void;
type TableBlock = Extract<FinalReportBlock, { kind: 'dataTable' | 'keyValueTable' }>;
const pt = (value: number) => `${value}pt`;
const REPORT_FONT_FAMILY = '"Malgun Gothic", "맑은 고딕", sans-serif';
const EDIT_BUTTON_STYLE: CSSProperties = { border: 0, background: 'transparent', color: 'inherit', padding: 0, margin: 0, font: 'inherit', textAlign: 'inherit', whiteSpace: 'pre', display: 'block', width: '100%' };

function pagePosition(top: number): CSSProperties {
    return { position: 'absolute', top: pt(top), left: pt(REPORT_PAPER.margin), width: pt(REPORT_PAPER.body) };
}

function Cover({ block }: { block: CoverBlock }) {
    const elements = reportCoverElements({ ...block, outputDate: reportOutputDate() });
    return <div data-report-cover>{elements.map((element, index) => {
        const position = pagePosition(element.top);
        if (element.kind === 'divider') return <div key={index} style={{ ...position, height: pt(element.height), background: '#959595' }} />;
        if (element.kind === 'title') return <h1 key={index} style={{ ...position, margin: 0, fontFamily: 'Batang, "바탕", serif', fontSize: pt(element.fontSize), lineHeight: 1.2, textAlign: 'center', fontWeight: 700 }}>{element.text}</h1>;
        return <div key={index} style={{ ...position, textAlign: 'center', fontSize: pt(element.fontSize), lineHeight: 1.55, fontWeight: element.bold ? 700 : 400, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{element.text}</div>;
    })}</div>;
}

function RichTextLines({ lines, links }: { lines: ReportTextRun[][]; links: boolean }) {
    return <>{lines.map((line, index) => <span key={index}>{index > 0 ? '\n' : ''}{line.map((run, runIndex) => {
        let text: ReactNode = run.text;
        if (run.code) text = <code style={{ fontFamily: 'Consolas, monospace', fontSize: 'inherit', background: '#f1f3f5' }}>{text}</code>;
        if (run.bold) text = <strong>{text}</strong>;
        if (run.italic) text = <em>{text}</em>;
        if (run.strike) text = <del>{text}</del>;
        if (run.href) text = links ? <a href={run.href} style={{ color: '#1d4ed8', textDecoration: 'underline' }}>{text}</a> : <span style={{ color: '#1d4ed8', textDecoration: 'underline' }}>{text}</span>;
        return <span key={runIndex}>{text}</span>;
    })}</span>)}</>;
}

function EditableReportValue({ text, richLines, target, onRequestEdit }: { text: string; richLines?: ReportTextRun[][]; target?: EditTarget; onRequestEdit?: RequestEdit }) {
    const editable = Boolean(target && onRequestEdit);
    const content = richLines ? <RichTextLines lines={richLines} links={!editable} /> : text;
    if (!target || !onRequestEdit) return content;
    return <button type="button" style={EDIT_BUTTON_STYLE} aria-label={target.ariaLabel} onClick={() => onRequestEdit(target)}>{content}</button>;
}

function textEditTarget(block: FinalReportBlock, blockIndex: number): EditTarget | undefined {
    if (block.kind !== 'heading' && block.kind !== 'paragraph') return;
    return { label: '보고서 문구 교정', value: block.text, edit: { kind: 'text', blockIndex, text: block.text },
        ariaLabel: `${block.kind === 'heading' ? '제목' : '문단'} ${blockIndex + 1} 교정` };
}

function ReportText({ item, block, onRequestEdit, originLeft = REPORT_PAPER.margin }: { item: Extract<ReportLayoutItem, { kind: 'text' }>; block: FinalReportBlock; onRequestEdit?: RequestEdit; originLeft?: number }) {
    const styles: CSSProperties = {
        ...pagePosition(item.top),
        left: pt(originLeft + item.left),
        width: pt(item.width), height: pt(item.height),
        fontSize: pt(item.fontSize), lineHeight: pt(item.lineHeight),
        fontWeight: item.bold ? 700 : 400, color: `#${item.color}`,
        background: item.chapter ? '#e1e1e1' : item.code ? '#f1f3f5' : 'transparent',
        ...(item.quote ? { boxShadow: '-3pt 0 0 #94a3b8' } : {}),
        padding: item.chapter ? `${pt(REPORT_CHAPTER_PADDING.vertical)} ${pt(REPORT_CHAPTER_PADDING.horizontal)}` : 0,
        boxSizing: 'border-box', whiteSpace: 'pre',
    };
    const target = textEditTarget(block, item.blockIndex);
    return <div style={styles} data-report-block={item.blockIndex} data-report-code={item.code || undefined}>
        {item.marker && <span style={{ position: 'absolute', top: 0, left: pt(-item.markerWidth) }}>{item.marker}</span>}
        <EditableReportValue text={item.lines.join('\n')} richLines={item.richLines} target={target} onRequestEdit={onRequestEdit} />
    </div>;
}

function tableCellEditTarget(block: TableBlock | Extract<FinalReportBlock, { kind: 'paragraph' }>, blockIndex: number, row: number, column: number): EditTarget | undefined {
    if (block.kind === 'paragraph') return textEditTarget(block, blockIndex);
    if (block.kind === 'dataTable') {
        if (row < 0) return { label: '표 머리글 교정', value: block.headers[column], ariaLabel: `머리글 ${column + 1} 교정`, edit: { kind: 'tableHeader', blockIndex, col: column, value: block.headers[column] } };
        const value = block.rows[row][column];
        return { label: '표 내용 교정', value, ariaLabel: `${row + 1}행 ${column + 1}열 교정`, edit: { kind: 'tableCell', blockIndex, row, col: column, value } };
    }
    if (column === 1) {
        const { label, value } = block.rows[row];
        return { label, value, edit: { kind: 'keyValue', blockIndex, row, value } };
    }
}

function ReportTable({ item, block, onRequestEdit, left = REPORT_PAPER.margin }: { item: Extract<ReportLayoutItem, { kind: 'table' }>; block: TableBlock | Extract<FinalReportBlock, { kind: 'paragraph' }>; onRequestEdit?: RequestEdit; left?: number }) {
    const cellStyle: CSSProperties = { border: '.4pt solid #929ba4', padding: '6pt 3pt', verticalAlign: 'top', fontSize: pt(item.fontSize), lineHeight: pt(item.lineHeight), whiteSpace: 'pre', fontWeight: 400, boxSizing: 'border-box', color: '#1b1b1b' };
    const mergeSpans = getTableMergeSpans(item, block);
    return <table data-report-block={item.blockIndex} style={{ ...pagePosition(item.top), left: pt(left), tableLayout: 'fixed', borderCollapse: 'collapse', color: '#1b1b1b' }}>
        <colgroup>{item.widths.map((width, i) => <col key={i} style={{ width: pt(width) }} />)}</colgroup>
        {item.structuredHeaders && block.kind === 'dataTable' ? <thead>{item.structuredHeaders.map((row, index) => <tr key={index} style={{ height: pt(row.height) }}>{row.cells.map(cell => <th key={cell.column} colSpan={cell.span} rowSpan={cell.rowSpan} style={{ ...cellStyle, background: '#e7ecf1', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' }}>
            <EditableReportValue text={cell.lines.join('\n')} onRequestEdit={onRequestEdit} target={{ label: '표 머리글 교정', value: cell.text, ariaLabel: `${cell.group ? '그룹 ' : ''}머리글 ${cell.column + 1} 교정`, edit: { kind: cell.group ? 'tableGroup' : 'tableHeader', blockIndex: item.blockIndex, col: cell.column, value: cell.text } }} />
        </th>)}</tr>)}</thead> : !!item.headers.length && <thead><tr style={{ height: pt(item.headerHeight) }}>{item.headers.map((lines, col) => <th key={col} style={{ ...cellStyle, background: '#e7ecf1', fontWeight: 700, textAlign: 'left' }}>
            <EditableReportValue text={lines.join('\n')} richLines={item.richHeaders?.[col]} onRequestEdit={onRequestEdit} target={block.kind === 'dataTable' ? {
                label: '표 머리글 교정', value: block.headers[col], ariaLabel: `머리글 ${col + 1} 교정`, edit: { kind: 'tableHeader', blockIndex: item.blockIndex, col, value: block.headers[col] },
            } : textEditTarget(block, item.blockIndex)} />
        </th>)}</tr></thead>}
        <tbody>{item.rows.map((row, index) => { const columnSpans = block.kind === 'dataTable' ? reportColumnSpans(block, row.index) : row.lines.map(() => 1); return <tr key={index} style={{ height: pt(row.height), background: block.kind === 'dataTable' && block.highlightRows?.includes(row.index) ? '#dcfce7' : undefined }}>{row.lines.map((lines, col) => mergeSpans[index][col] === 0 || columnSpans[col] === 0 ? null : <td key={col} colSpan={columnSpans[col] > 1 ? columnSpans[col] : undefined} rowSpan={mergeSpans[index][col] > 1 ? mergeSpans[index][col] : undefined} style={mergeSpans[index][col] > 1 ? { ...cellStyle, verticalAlign: 'middle', textAlign: 'center' } : cellStyle}>
            <EditableReportValue text={lines.join('\n') || '\u00a0'} richLines={row.richLines?.[col]} target={tableCellEditTarget(block, item.blockIndex, row.index, col)} onRequestEdit={onRequestEdit} />
        </td>)}</tr>; })}</tbody>
    </table>;
}

function ReportBox({ item, block, onRequestEdit }: { item: Extract<ReportLayoutItem, { kind: 'box' }>; block: Extract<TableBlock, { kind: 'dataTable' }>; onRequestEdit?: RequestEdit }) {
    const paragraph: FinalReportBlock = { kind: 'paragraph', text: block.rows[0][0] };
    const editBody: RequestEdit | undefined = onRequestEdit ? () => onRequestEdit({ label: '추가 시장 자료 교정', value: paragraph.text,
        edit: { kind: 'tableCell', blockIndex: item.blockIndex, row: 0, col: 0, value: paragraph.text } }) : undefined;
    return <section data-report-box data-report-block={item.blockIndex} aria-label={item.title} style={{ ...pagePosition(item.top), left: pt(REPORT_PAPER.margin), width: pt(item.width), height: pt(item.height), outline: '.4pt solid #929ba4' }}>
        <div style={{ height: pt(REPORT_BOX.headerHeight), padding: '6pt 3pt', boxSizing: 'border-box', background: '#e7ecf1', borderBottom: '.4pt solid #929ba4', fontSize: '9pt', lineHeight: '14pt', fontWeight: 700, textAlign: 'center' }}>
            <EditableReportValue text={item.title} onRequestEdit={onRequestEdit} target={{ label: '표 머리글 교정', value: item.title, edit: { kind: 'tableHeader', blockIndex: item.blockIndex, col: 0, value: item.title } }} />
        </div>
        {item.items.map((child, index) => child.kind === 'text'
            ? <ReportText key={index} item={child} block={paragraph} onRequestEdit={editBody} originLeft={REPORT_BOX.padding} />
            : child.kind === 'table' ? <ReportTable key={index} item={child} block={paragraph} onRequestEdit={editBody} left={REPORT_BOX.padding} /> : null)}
    </section>;
}

function PageItem({ item, blocks, onRequestEdit }: { item: ReportLayoutItem; blocks: FinalReportBlock[]; onRequestEdit?: RequestEdit }) {
    const block = blocks[item.blockIndex];
    if (item.kind === 'box') return <ReportBox item={item} block={block as Extract<TableBlock, { kind: 'dataTable' }>} onRequestEdit={onRequestEdit} />;
    if (item.kind === 'image') return <figure style={{ ...pagePosition(item.top), margin: 0, textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 저장된 워크시트 그림을 출력 치수로 표시한다. */}
        <img src={item.block.pngDataUrl} alt={item.block.title} style={{ width: pt(item.width), height: pt(item.height), maxWidth: 'none', display: 'block', margin: '0 auto' }} />
    </figure>;
    if (item.kind === 'text') return <ReportText item={item} block={block} onRequestEdit={onRequestEdit} />;
    return <ReportTable item={item} block={block as TableBlock | Extract<FinalReportBlock, { kind: 'paragraph' }>} onRequestEdit={onRequestEdit} />;
}

function ReportPaper({ page, pageNumber, projectName, blocks, onRequestEdit }: { page: ReportPageLayout; pageNumber: number; projectName?: string; blocks: FinalReportBlock[]; onRequestEdit?: RequestEdit }) {
    return <article data-report-page={pageNumber} aria-label={`보고서 ${pageNumber}쪽`} style={{ position: 'relative', width: pt(REPORT_PAPER.width), height: pt(REPORT_PAPER.height), boxSizing: 'border-box', background: '#fff', color: '#1b1b1b', fontFamily: REPORT_FONT_FAMILY, margin: '0 auto 18pt', boxShadow: '0 2px 8px #0002', overflow: 'hidden' }}>
        <header style={{ position: 'absolute', top: '20pt', left: '42pt', width: pt(REPORT_PAPER.body), height: '17pt', padding: '2pt 8pt', background: '#888', color: '#fff', fontSize: '8pt', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8pt' }}>
            <span style={{ whiteSpace: 'nowrap' }}>KS-QFD 활용 제품개선보고서</span><span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{projectName}</span>
        </header>
        {page.cover ? <Cover block={page.cover} /> : page.items.map((item, index) => <PageItem key={index} item={item} blocks={blocks} onRequestEdit={onRequestEdit} />)}
        <footer style={{ position: 'absolute', bottom: '14.5pt', left: pt(REPORT_PAPER.width / 2 - 10.5), width: '21pt', height: '21pt', borderRadius: '50%', background: '#747474', color: 'white', textAlign: 'center', fontSize: '8.5pt', lineHeight: '21pt' }}>{pageNumber}</footer>
    </article>;
}

function ReportEditDialog({ target, editable, onChange, onClose, onSave }: { target: EditTarget; editable: boolean; onChange: (value: string) => void; onClose: () => void; onSave: () => void }) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <section role="dialog" aria-modal="true" aria-labelledby="report-edit-title" className="w-full max-w-2xl rounded-xl bg-white p-6 text-slate-900 shadow-xl" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
            <h3 id="report-edit-title" className="text-lg font-bold">{target.label}</h3>
            <textarea autoFocus aria-label={target.label} value={target.value} disabled={!editable} rows={8} onChange={event => onChange(event.target.value)} className="mt-4 w-full rounded border border-slate-300 bg-white p-3 text-slate-900" />
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded border px-4 py-2">취소</button><button type="button" disabled={!editable} onClick={onSave} className="rounded bg-blue-700 px-4 py-2 text-white">교정 반영</button></div>
        </section>
    </div>;
}

export default function FinalReportPages({ blocks: sourceBlocks, onEdit, readOnly, disabled }: Props) {
    const blocks = useMemo(() => normalizeReportLabels(sourceBlocks), [sourceBlocks]);
    const pages = useMemo(() => layoutReportPages(blocks), [blocks]);
    const cover = blocks.find((block): block is CoverBlock => block.kind === 'cover');
    const [target, setTarget] = useState<EditTarget | null>(null);
    const editable = Boolean(onEdit && !readOnly && !disabled);
    function saveEdit() {
        if (!target || !editable) return;
        onEdit?.(target.edit.kind === 'text' ? { ...target.edit, text: target.value } : { ...target.edit, value: target.value });
        setTarget(null);
    }
    return <>
        <p className="text-sm text-gray-400">A4 {pages.length}쪽 · 작성일은 출력일 기준입니다.</p>
        <div className="flex flex-wrap gap-3 text-sm">
            {blocks.filter(block => block.kind === 'image').map((block, index) => <a key={index} href={block.pngDataUrl} download={worksheetImageFileName(block.title, block.pngDataUrl)} className="text-primary-300 underline">{block.title} 그림 다운로드</a>)}
        </div>
        <div className="overflow-x-auto rounded-lg bg-slate-200 p-3" data-report-pages>
            {pages.map((page, index) => <ReportPaper key={index} page={page} pageNumber={index + 1} projectName={cover?.projectName} blocks={blocks} onRequestEdit={editable ? setTarget : undefined} />)}
        </div>
        {target && <ReportEditDialog target={target} editable={editable} onChange={value => setTarget({ ...target, value })} onClose={() => setTarget(null)} onSave={saveEdit} />}
    </>;
}
