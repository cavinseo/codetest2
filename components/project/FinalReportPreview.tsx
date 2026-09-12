'use client';
// 문서 모델을 화면에 그려 내려받기 전에 확인하고 고칠 수 있게 한다.
//
// 표 절은 워크시트 DB 에서 바로 문서로 넘어가기 때문에, 미리보기가 없으면 값이
// 어떻게 들어갔는지 보려고 매번 Word 로 열어야 했다. 여기서 고친 내용은 문서에만
// 남고 워크시트로 돌아가지 않는다 — 원본이 틀렸다면 그 워크시트에서 고치는 것이 맞다.
import type { FinalReportBlock } from '@/lib/final-report-document';
import type { BlockEdit } from '@/lib/final-report-edit';

interface Props {
    blocks: FinalReportBlock[];
    onEdit: (edit: BlockEdit) => void;
}

/** 블록 한 종류를 그리는 데 필요한 것: 그 블록과, 편집을 어느 블록으로 돌려보낼지. */
interface BlockViewProps<Kind extends FinalReportBlock['kind']> {
    block: Extract<FinalReportBlock, { kind: Kind }>;
    blockIndex: number;
    onEdit: (edit: BlockEdit) => void;
}

const cellClass = 'w-full bg-transparent px-2 py-1 text-sm outline-none focus:bg-black/5';

function HeadingBlockView({ block, blockIndex, onEdit }: BlockViewProps<'heading'>) {
    return (
        <input
            value={block.text}
            onChange={(event) => onEdit({ kind: 'text', blockIndex, text: event.target.value })}
            aria-label={`제목 ${blockIndex + 1}`}
            className={`${block.level === 1 ? 'mt-8 text-xl font-bold' : 'mt-6 text-base font-semibold'} w-full bg-transparent outline-none focus:bg-black/5`}
        />
    );
}

function ParagraphBlockView({ block, blockIndex, onEdit }: BlockViewProps<'paragraph'>) {
    return (
        <textarea
            value={block.text}
            rows={2}
            onChange={(event) => onEdit({ kind: 'text', blockIndex, text: event.target.value })}
            aria-label={`문단 ${blockIndex + 1}`}
            className="mt-2 w-full resize-y bg-transparent text-sm outline-none focus:bg-black/5"
        />
    );
}

function KeyValueTableBlockView({ block, blockIndex, onEdit }: BlockViewProps<'keyValueTable'>) {
    return (
        <table className="mt-2 w-full border-collapse text-sm">
            <tbody>
                {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                        <th className="w-1/3 border border-slate-300 bg-slate-100 p-2 text-left font-semibold">{row.label}</th>
                        <td className="border border-slate-300 p-0">
                            <input
                                value={row.value}
                                onChange={(event) => onEdit({ kind: 'keyValue', blockIndex, row: rowIndex, value: event.target.value })}
                                aria-label={row.label}
                                className={cellClass}
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function DataTableBlockView({ block, blockIndex, onEdit }: BlockViewProps<'dataTable'>) {
    return (
        <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr>
                        {block.headers.map((text, col) => (
                            <th key={col} className="border border-slate-300 bg-slate-100 p-0">
                                <input
                                    value={text}
                                    onChange={(event) => onEdit({ kind: 'tableHeader', blockIndex, col, value: event.target.value })}
                                    aria-label={`머리글 ${col + 1}`}
                                    className={`${cellClass} text-center font-semibold`}
                                />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {block.rows.map((cells, rowIndex) => (
                        <tr key={rowIndex}>
                            {cells.map((cell, col) => (
                                <td key={col} className="border border-slate-300 p-0">
                                    <input
                                        value={cell}
                                        onChange={(event) => onEdit({ kind: 'tableCell', blockIndex, row: rowIndex, col, value: event.target.value })}
                                        aria-label={`${rowIndex + 1}행 ${col + 1}열`}
                                        className={cellClass}
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** 캡처한 그림은 고칠 것이 없으므로 문서에 들어갈 크기만 함께 보여 준다. */
function ImageBlockView({ block }: { block: Extract<FinalReportBlock, { kind: 'image' }> }) {
    return (
        <figure className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- 캡처한 dataURL 이라 최적화 대상이 아니다. */}
            <img src={block.pngDataUrl} alt={block.title} className="max-w-full border border-slate-300" />
            <figcaption className="mt-1 text-xs text-slate-500">
                {block.title} · {Math.round(block.widthMm)}×{Math.round(block.heightMm)}mm
                {block.landscape ? ' · 가로 페이지' : ''}
            </figcaption>
        </figure>
    );
}

function BlockView({ block, blockIndex, onEdit }: { block: FinalReportBlock; blockIndex: number; onEdit: (edit: BlockEdit) => void }) {
    switch (block.kind) {
        case 'heading':
            return <HeadingBlockView block={block} blockIndex={blockIndex} onEdit={onEdit} />;
        case 'paragraph':
            return <ParagraphBlockView block={block} blockIndex={blockIndex} onEdit={onEdit} />;
        case 'keyValueTable':
            return <KeyValueTableBlockView block={block} blockIndex={blockIndex} onEdit={onEdit} />;
        case 'dataTable':
            return <DataTableBlockView block={block} blockIndex={blockIndex} onEdit={onEdit} />;
        case 'image':
            return <ImageBlockView block={block} />;
    }
}

export default function FinalReportPreview({ blocks, onEdit }: Props) {
    return (
        // 인쇄면을 흉내 낸 흰 바탕이다. 문서가 흰 종이에 찍히므로 여기서도 같은 대비로 본다.
        <div className="rounded-lg bg-white p-8 text-slate-900 shadow-inner">
            {blocks.map((block, blockIndex) => (
                <BlockView key={blockIndex} block={block} blockIndex={blockIndex} onEdit={onEdit} />
            ))}
        </div>
    );
}
