'use client';
// 샘플과 같은 표지와 A4 페이지를 표시하고 원본 보고서 블록의 교정을 연결한다.
import { useMemo, useState, type CSSProperties } from 'react';
import type { FinalReportBlock } from '@/lib/final-report-document';
import type { BlockEdit } from '@/lib/final-report-edit';
import { worksheetImageFileName } from '@/lib/worksheet-capture';
import { layoutReportPages, reportOutputDate, REPORT_PAPER, type CoverBlock, type ReportLayoutItem } from '@/lib/final-report-layout';

interface Props { blocks: FinalReportBlock[]; onEdit?: (edit: BlockEdit) => void; readOnly?: boolean; disabled?: boolean }
interface EditTarget { label: string; value: string; edit: BlockEdit }
const pt = (value: number) => `${value}pt`;
const family = '"Malgun Gothic", "맑은 고딕", sans-serif';
const flatButton: CSSProperties = { border: 0, background: 'transparent', color: 'inherit', padding: 0, margin: 0, font: 'inherit', textAlign: 'inherit', whiteSpace: 'pre', display: 'block', width: '100%' };

function Cover({ block }: { block: CoverBlock }) {
    const line = (top: number, text: string, size: number, bold = false): React.ReactNode => <div style={{ position: 'absolute', top: pt(top), left: pt(42), width: pt(REPORT_PAPER.body), textAlign: 'center', fontSize: pt(size), lineHeight: 1.55, fontWeight: bold ? 700 : 400, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</div>;
    return <div data-report-cover>
        {line(96, 'KS-QFD 제품개발 및 개선프로그램 결과보고서', 11, true)}
        <h1 style={{ position: 'absolute', top: pt(218), left: pt(42), width: pt(REPORT_PAPER.body), margin: 0, fontFamily: 'Batang, "바탕", serif', fontSize: pt(25), lineHeight: 1.2, textAlign: 'center', fontWeight: 700 }}>{block.title}</h1>
        {line(260, block.projectName, 12)}
        {line(302, `기업명: ${block.companyName}`, 15, true)}
        <div style={{ position: 'absolute', top: pt(339), left: pt(42), width: pt(REPORT_PAPER.body), height: pt(10), background: '#959595' }} />
        {line(442, `작성일: ${reportOutputDate()}`, 13)}
        {line(510, `코치명: ${block.coachName}`, 13)}
        {line(650, '케이랩스\nKS-QFD', 17, true)}
    </div>;
}

function PageItem({ item, blocks, edit }: { item: ReportLayoutItem; blocks: FinalReportBlock[]; edit?: (target: EditTarget) => void }) {
    const block = blocks[item.blockIndex];
    const position: CSSProperties = { position: 'absolute', top: pt(item.top), left: pt(REPORT_PAPER.margin), width: pt(REPORT_PAPER.body) };
    if (item.kind === 'image') return <figure style={{ ...position, margin: 0, textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 저장된 워크시트 그림을 출력 치수로 표시한다. */}
        <img src={item.block.pngDataUrl} alt={item.block.title} style={{ width: pt(item.width), height: pt(item.height), maxWidth: 'none', display: 'inline-block' }} />
    </figure>;
    if (item.kind === 'text') {
        const styles: CSSProperties = { ...position, height: pt(item.height), fontSize: pt(item.fontSize), lineHeight: pt(item.lineHeight), fontWeight: item.bold ? 700 : 400, color: `#${item.color}`, background: item.chapter ? '#e1e1e1' : 'transparent', padding: item.chapter ? '6pt 10pt' : item.section ? '0 0 0 17pt' : 0, boxSizing: 'border-box', whiteSpace: 'pre' };
        const content = item.lines.join('\n');
        return <div style={styles} data-report-block={item.blockIndex}>
            {item.section && <span aria-hidden style={{ position: 'absolute', top: '4pt', left: 0, width: '9pt', height: '9pt', borderRadius: '2pt', background: '#949494' }} />}
            {edit && (block.kind === 'heading' || block.kind === 'paragraph') ? <button type="button" style={flatButton} aria-label={`${block.kind === 'heading' ? '제목' : '문단'} ${item.blockIndex + 1} 교정`} onClick={() => edit({ label: '보고서 문구 교정', value: block.text, edit: { kind: 'text', blockIndex: item.blockIndex, text: block.text } })}>{content}</button> : content}
        </div>;
    }
    const cellStyle: CSSProperties = { border: '.4pt solid #929ba4', padding: '6pt 3pt', verticalAlign: 'top', fontSize: pt(item.fontSize), lineHeight: pt(item.lineHeight), whiteSpace: 'pre', fontWeight: 400, boxSizing: 'border-box', color: '#1b1b1b' };
    return <table data-report-block={item.blockIndex} style={{ ...position, tableLayout: 'fixed', borderCollapse: 'collapse', color: '#1b1b1b' }}>
        <colgroup>{item.widths.map((width, i) => <col key={i} style={{ width: pt(width) }} />)}</colgroup>
        {!!item.headers.length && <thead><tr style={{ height: pt(item.headerHeight) }}>{item.headers.map((lines, col) => <th key={col} style={{ ...cellStyle, background: '#e7ecf1', fontWeight: 700, textAlign: 'left' }}>
            {edit && block.kind === 'dataTable' ? <button style={flatButton} type="button" aria-label={`머리글 ${col + 1} 교정`} onClick={() => edit({ label: '표 머리글 교정', value: block.headers[col], edit: { kind: 'tableHeader', blockIndex: item.blockIndex, col, value: block.headers[col] } })}>{lines.join('\n')}</button> : lines.join('\n')}
        </th>)}</tr></thead>}
        <tbody>{item.rows.map((row, index) => <tr key={index} style={{ height: pt(row.height) }}>{row.lines.map((lines, col) => <td key={col} style={cellStyle}>
            {edit && block.kind === 'dataTable' ? <button type="button" style={flatButton} aria-label={`${row.index + 1}행 ${col + 1}열 교정`} onClick={() => edit({ label: '표 내용 교정', value: block.rows[row.index][col], edit: { kind: 'tableCell', blockIndex: item.blockIndex, row: row.index, col, value: block.rows[row.index][col] } })}>{lines.join('\n') || '\u00a0'}</button>
                : edit && block.kind === 'keyValueTable' && col === 1 ? <button type="button" style={flatButton} onClick={() => edit({ label: block.rows[row.index].label, value: block.rows[row.index].value, edit: { kind: 'keyValue', blockIndex: item.blockIndex, row: row.index, value: block.rows[row.index].value } })}>{lines.join('\n') || '\u00a0'}</button>
                    : lines.join('\n') || '\u00a0'}
        </td>)}</tr>)}</tbody>
    </table>;
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
            {pages.map((page, index) => <article key={index} data-report-page={index + 1} aria-label={`보고서 ${index + 1}쪽`} style={{ position: 'relative', width: pt(REPORT_PAPER.width), height: pt(REPORT_PAPER.height), boxSizing: 'border-box', background: '#fff', color: '#1b1b1b', fontFamily: family, margin: '0 auto 18pt', boxShadow: '0 2px 8px #0002', overflow: 'hidden' }}>
                <header style={{ position: 'absolute', top: '20pt', left: '42pt', width: pt(REPORT_PAPER.body), height: '17pt', padding: '2pt 8pt', background: '#888', color: '#fff', fontSize: '8pt', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8pt' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>KS-QFD 활용 제품개선보고서</span><span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{cover?.projectName}</span>
                </header>
                {page.cover ? <Cover block={page.cover} /> : page.items.map((item, i) => <PageItem key={i} item={item} blocks={blocks} edit={editable ? setTarget : undefined} />)}
                <footer style={{ position: 'absolute', bottom: '14.5pt', left: pt(REPORT_PAPER.width / 2 - 10.5), width: '21pt', height: '21pt', borderRadius: '50%', background: '#747474', color: 'white', textAlign: 'center', fontSize: '8.5pt', lineHeight: '21pt' }}>{index + 1}</footer>
            </article>)}
        </div>
        {target && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTarget(null)}>
            <section role="dialog" aria-modal="true" aria-labelledby="report-edit-title" className="w-full max-w-2xl rounded-xl bg-white p-6 text-slate-900 shadow-xl" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setTarget(null); }}>
                <h3 id="report-edit-title" className="text-lg font-bold">{target.label}</h3>
                <textarea autoFocus aria-label={target.label} value={target.value} disabled={!editable} rows={8} onChange={event => setTarget({ ...target, value: event.target.value })} className="mt-4 w-full rounded border border-slate-300 bg-white p-3 text-slate-900" />
                <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setTarget(null)} className="rounded border px-4 py-2">취소</button><button type="button" disabled={!editable} onClick={saveEdit} className="rounded bg-blue-700 px-4 py-2 text-white">교정 반영</button></div>
            </section>
        </div>}
    </>;
}
