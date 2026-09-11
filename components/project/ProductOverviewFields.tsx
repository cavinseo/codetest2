'use client';
// 개요의 제품명·이미지·시장·고객 정보를 편집 권한에 맞게 표시한다.
import { useEffect, useRef } from 'react';
import { optimizeReportImage } from '@/lib/final-report-image';
import { PRODUCT_IMAGE_MAX_LENGTH, type ProductOverview } from '@/lib/product-overview';

interface Props {
    value: ProductOverview;
    editing?: boolean;
    disabled?: boolean;
    onChange?: (patch: ProductOverview) => void;
    onBusy?: (busy: boolean) => void;
    onError?: (error: string) => void;
}

export default function ProductOverviewFields({ value, editing = false, disabled = false, onChange, onBusy, onError }: Props) {
    const generation = useRef(0);
    useEffect(() => () => { generation.current += 1; onBusy?.(false); }, [onBusy]);
    async function selectImage(file?: File) {
        if (!file) return;
        const selection = ++generation.current;
        onBusy?.(true);
        onError?.('');
        try {
            if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('PNG 또는 JPEG 이미지를 선택하세요.');
            const image = await optimizeReportImage(file);
            if (image.dataUrl.length > PRODUCT_IMAGE_MAX_LENGTH) throw new Error('제품 이미지가 큽니다. 더 작은 이미지로 다시 선택하세요.');
            if (selection === generation.current) onChange?.({ productImageDataUrl: image.dataUrl, productImageWidthPx: image.widthPx, productImageHeightPx: image.heightPx });
        } catch (error) {
            if (selection === generation.current) onError?.(error instanceof Error ? error.message : '이미지를 읽지 못했습니다.');
        } finally { if (selection === generation.current) onBusy?.(false); }
    }
    return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {([
            ['productName', '제품(서비스) 명'], ['marketDefinition', '시장정의'], ['targetCustomer', '목표 고객'],
        ] as const).map(([key, label]) => <div key={key} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
            {editing ? <label className="block text-sm text-gray-300">{label}
                <textarea rows={key === 'productName' ? 1 : 3} maxLength={key === 'productName' ? 300 : 20_000} className="input mt-2 w-full" value={value[key] ?? ''} disabled={disabled} onChange={event => onChange?.({ [key]: event.target.value })} />
            </label> : <><p className="text-xs text-gray-500 mb-2">{label}</p><p className="text-sm text-white whitespace-pre-wrap">{value[key] || '입력된 내용이 없습니다.'}</p></>}
        </div>)}
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
            <p className="text-xs text-gray-500">제품 이미지</p>
            {value.productImageDataUrl ? <>
                {/* eslint-disable-next-line @next/next/no-img-element -- 개요에 저장한 최적화 이미지를 직접 표시한다. */}
                <img src={value.productImageDataUrl} alt="제품 이미지" className="max-h-60 max-w-full rounded object-contain" />
                {editing && <button type="button" disabled={disabled} className="btn-secondary text-xs" onClick={() => onChange?.({ productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null })}>제품 이미지 제거</button>}
            </> : <p className="text-sm text-gray-500">등록된 이미지가 없습니다.</p>}
            {editing && <label className="block text-sm text-gray-300">제품 이미지 선택
                <input type="file" accept="image/png,image/jpeg" disabled={disabled} className="block mt-2 max-w-full" onChange={event => { void selectImage(event.target.files?.[0]); event.target.value = ''; }} />
                <span className="mt-2 block text-xs text-gray-500">PNG/JPEG · 원본 20MB 이하 · 저장 전 자동 최적화합니다.</span>
            </label>}
        </div>
    </div>;
}
