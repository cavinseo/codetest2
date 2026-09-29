'use client';
// 샘플과 같은 표지와 A4 페이지를 표시하고 원본 보고서 블록의 교정을 연결한다.
import { useMemo, useState, type CSSProperties } from 'react';
import type { FinalReportBlock } from '@/lib/final-report-document';
import type { BlockEdit } from '@/lib/final-report-edit';
import { worksheetImageFileName } from '@/lib/worksheet-capture';
import { layoutReportPages, reportCoverElements, reportOutputDate, REPORT_CHAPTER_PADDING, REPORT_PAPER, type CoverBlock, type ReportLayoutItem, type ReportPageLayout } from '@/lib/final-report-layout';

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

function EditableReportValue({ text, target, onRequestEdit }: { text: string; target?: EditTarget; onRequestEdit?: RequestEdit }) {
    if (!target || !onRequestEdit) return text;
    return <button type="button" style={EDIT_BUTTON_STYLE} aria-label={target.ariaLabel} onClick={() => onRequestEdit(target)}>{text}</button>;
}

function ReportText({ item, block, onRequestEdit }: { item: Extract<ReportLayoutItem, { kind: 'text' }>; block: FinalReportBlock; onRequestEdit?: RequestEdit }) {
    const styles: CSSProperties = {
        ...pagePosition(item.top),
        left: pt(REPORT_PAPER.margin + item.left),
        width: pt(item.width), height: pt(item.height),
        fontSize: pt(item.fontSize), lineHeight: pt(item.lineHeight),
        fontWeight: item.bold ? 700 : 400, color: `#${item.color}`,
        background: item.chapter ? '#e1e1e1' : 'transparent',
        padding: item.chapter ? `${pt(REPORT_CHAPTER_PADDING.vertical)} ${pt(REPORT_CHAPTER_PADDING.horizontal)}` : 0,
        boxSizing: 'border-box', whiteSpace: 'pre',
    };
    const target: EditTarget | undefined = block.kind === 'heading' || block.kind === 'paragraph' ? {
        label: '보고서 문구 교정', value: block.text, edit: { kind: 'text', blockIndex: item.blockIndex, text: block.text },
        ariaLabel: `${block.kind === 'heading' ? '제목' : '문단'} ${item.blockIndex + 1} 교정`,
    } : undefined;
    return <div style={styles} data-report-block={item.blockIndex}>
        {item.marker && <span style={{ position: 'absolute', top: 0, left: pt(-item.markerWidth) }}>{item.marker}</span>}
        <EditableReportValue text={item.lines.join('\n')} target={target} onRequestEdit={onRequestEdit} />
    </div>;
}

function tableCellEditTarget(block: TableBlock, blockIndex: number, row: number, column: number): EditTarget | undefined {
    if (block.kind === 'dataTable') {
        const value = block.rows[row][column];
        return { label: '표 내용 교정', value, ariaLabel: `${row + 1}행 ${column + 1}열 교정`, edit: { kind: 'tableCell', blockIndex, row, col: column, value } };
    }
    if (column === 1) {
        const { label, value } = block.rows[row];
        return { label, value, edit: { kind: 'keyValue', blockIndex, row, value } };
    }
}

function ReportTable({ item, block, onRequestEdit }: { item: Extract<ReportLayoutItem, { kind: 'table' }>; block: TableBlock; onRequestEdit?: RequestEdit }) {
    const cellStyle: CSSProperties = { border: '.4pt solid #929ba4', padding: '6pt 3pt', verticalAlign: 'top', fontSize: pt(item.fontSize), lineHeight: pt(item.lineHeight), whiteSpace: 'pre', fontWeight: 400, boxSizing: 'border-box', color: '#1b1b1b' };
    return <table data-report-block={item.blockIndex} style={{ ...pagePosition(item.top), tableLayout: 'fixed', borderCollapse: 'collapse', color: '#1b1b1b' }}>
        <colgroup>{item.widths.map((width, i) => <col key={i} style={{ width: pt(width) }} />)}</colgroup>
        {!!item.headers.length && <thead><tr style={{ height: pt(item.headerHeight) }}>{item.headers.map((lines, col) => <th key={col} style={{ ...cellStyle, background: '#e7ecf1', fontWeight: 700, textAlign: 'left' }}>
            <EditableReportValue text={lines.join('\n')} onRequestEdit={onRequestEdit} target={block.kind === 'dataTable' ? {
                label: '표 머리글 교정', value: block.headers[col], ariaLabel: `머리글 ${col + 1} 교정`, edit: { kind: 'tableHeader', blockIndex: item.blockIndex, col, value: block.headers[col] },
            } : undefined} />
        </th>)}</tr></thead>}
        <tbody>{item.rows.map((row, index) => <tr key={index} style={{ height: pt(row.height) }}>{row.lines.map((lines, col) => <td key={col} style={cellStyle}>
            <EditableReportValue text={lines.join('\n') || '\u00a0'} target={tableCellEditTarget(block, item.blockIndex, row.index, col)} onRequestEdit={onRequestEdit} />
        </td>)}</tr>)}</tbody>
    </table>;
}

function PageItem({ item, blocks, onRequestEdit }: { item: ReportLayoutItem; blocks: FinalReportBlock[]; onRequestEdit?: RequestEdit }) {
    const block = blocks[item.blockIndex];
    if (item.kind === 'image') return <figure style={{ ...pagePosition(item.top), margin: 0, textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 저장된 워크시트 그림을 출력 치수로 표시한다. */}
        <img src={item.block.pngDataUrl} alt={item.block.title} style={{ width: pt(item.width), height: pt(item.height), maxWidth: 'none', display: 'inline-block' }} />
    </figure>;
    if (item.kind === 'text') return <ReportText item={item} block={block} onRequestEdit={onRequestEdit} />;
    return <ReportTable item={item} block={block as TableBlock} onRequestEdit={onRequestEdit} />;
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

export default function FinalReportPages({ blocks, onEdit, readOnly, disabled }: Props) {
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
