'use client';
// 상세 제품개요에 Markdown·HTML 미리보기와 한글 입력을 고려한 자동 목록 이어쓰기를 제공한다.
import { useLayoutEffect, useRef, useState } from 'react';
import { applyOverviewBullet, continueOverviewBullet, type OverviewTextEdit } from '@/lib/overview-bullets';
import ProductOverviewContent from './ProductOverviewContent';

interface Props {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

const markers = [['•', '점'], ['○', '동그라미'], ['▪', '사각형'], ['-', '대시']] as const;

export default function ProductOverviewDetailEditor({ value, onChange, disabled = false }: Props) {
    const textarea = useRef<HTMLTextAreaElement>(null);
    const pendingSelection = useRef<OverviewTextEdit | null>(null);
    const [preview, setPreview] = useState(false);

    useLayoutEffect(() => {
        const selection = pendingSelection.current;
        if (!selection || !textarea.current) return;
        textarea.current.focus();
        textarea.current.setSelectionRange(selection.selectionStart, selection.selectionEnd);
        pendingSelection.current = null;
    }, [value]);

    function applyEdit(edit: OverviewTextEdit) {
        if (edit.value === value) {
            textarea.current?.focus();
            textarea.current?.setSelectionRange(edit.selectionStart, edit.selectionEnd);
            return;
        }
        pendingSelection.current = edit;
        onChange(edit.value);
    }

    function applyMarker(marker: string | null) {
        const input = textarea.current;
        if (input) applyEdit(applyOverviewBullet(value, input.selectionStart, input.selectionEnd, marker));
    }

    return <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p id="overview-markup-help" className="text-xs text-gray-500">Markdown(MD)·HTML로 제목, 목록, 표 등을 작성할 수 있습니다.</p>
            <button type="button" disabled={disabled} className="btn-secondary text-xs" aria-label={`상세 제품개요 ${preview ? '편집으로 돌아가기' : '미리보기'}`} aria-expanded={preview} onClick={() => setPreview(!preview)}>
                {preview ? '편집으로 돌아가기' : '미리보기'}
            </button>
        </div>
        {preview ? <div role="region" aria-label="상세 제품개요 미리보기" className="min-h-40 rounded-md border border-white/[0.08] p-3">
            <ProductOverviewContent value={value} emptyMessage="미리볼 내용이 없습니다." />
        </div> : <>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="상세 제품개요 글머리">
                <span className="text-xs text-gray-400">글머리</span>
                {markers.map(([marker, label]) => <button key={marker} type="button" disabled={disabled}
                    aria-label={`${label} 글머리 적용`} className="btn-secondary text-xs"
                    onMouseDown={event => event.preventDefault()} onClick={() => applyMarker(marker)}>{marker} {label}</button>)}
                <button type="button" disabled={disabled} className="btn-secondary text-xs"
                    onMouseDown={event => event.preventDefault()} onClick={() => applyMarker(null)}>글머리 제거</button>
            </div>
            <textarea ref={textarea} aria-label="상세 제품개요" aria-describedby="overview-markup-help overview-bullet-help" value={value} disabled={disabled}
                onChange={event => onChange(event.target.value)} rows={7}
                onKeyDown={event => {
                    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
                        || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
                    const edit = continueOverviewBullet(value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
                    if (edit) { event.preventDefault(); applyEdit(edit); }
                }}
                className="w-full resize-y rounded-md border border-white/[0.08] bg-gray-950 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-primary-500" />
            <p id="overview-bullet-help" className="text-xs text-gray-500">현재 줄이나 선택한 여러 줄에 적용됩니다. Enter로 글머리를 이어 쓰고, 빈 항목에서 Enter를 누르면 종료합니다. Shift+Enter는 줄만 바꿉니다.</p>
        </>}
    </div>;
}
