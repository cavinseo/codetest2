'use client';
// 워크시트에 저장할 자리가 없어 보고서에만 쓰는 입력이다.
//
// 저장되지 않는 값이라 화면을 떠나면 사라진다. 그래서 입력칸을 보고서 생성
// 버튼과 같은 화면에 두고, 여기서 받은 값을 그대로 문서 모델로 넘긴다.
import type { Dispatch, SetStateAction } from 'react';
import type { FinalReportFreeInput } from '@/lib/final-report-document';

export const EMPTY_FREE_INPUT: FinalReportFreeInput = {
    productImageDataUrl: null,
    productImageWidthPx: null,
    productImageHeightPx: null,
    marketDefinition: '',
    targetCustomer: '',
    finalSpecExplanation: '',
    improvedProductName: '',
    improvedProductDescription: '',
};

/** 이미지를 뺀 나머지는 전부 여러 줄 문장이라 한 목록으로 묶어 그린다. */
const TEXT_FIELDS: Array<{ key: keyof FinalReportFreeInput; label: string; placeholder: string }> = [
    { key: 'marketDefinition', label: '시장정의', placeholder: '어떤 시장을 대상으로 하는지 서술하세요.' },
    { key: 'targetCustomer', label: '목표고객', placeholder: '핵심 목표고객을 서술하세요.' },
    { key: 'finalSpecExplanation', label: '최종 목표 스펙 항목별 설명', placeholder: '스펙별로 무엇이 달라지는지 서술하세요.' },
    { key: 'improvedProductName', label: '개선 제품(서비스)명', placeholder: '개선 후 제품명' },
    { key: 'improvedProductDescription', label: '개선 제품설명', placeholder: '개선 후 제품 설명' },
];

interface Props {
    value: FinalReportFreeInput;
    onChange: Dispatch<SetStateAction<FinalReportFreeInput>>;
}

export default function FinalReportFreeInputs({ value, onChange }: Props) {
    const updateField = (key: keyof FinalReportFreeInput, text: string) =>
        onChange((prev) => ({ ...prev, [key]: text }));

    const handleImage = (file: File | undefined) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result);
            // 원본 픽셀 크기를 함께 넘겨야 모델이 비율을 지킨다. 못 구하면 모델이
            // 고정 크기로 떨어뜨리므로 여기서 실패해도 보고서는 나온다.
            const image = new Image();
            image.onload = () => onChange((prev) => ({
                ...prev,
                productImageDataUrl: dataUrl,
                productImageWidthPx: image.naturalWidth,
                productImageHeightPx: image.naturalHeight,
            }));
            image.onerror = () => onChange((prev) => ({
                ...prev, productImageDataUrl: dataUrl, productImageWidthPx: null, productImageHeightPx: null,
            }));
            image.src = dataUrl;
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="card space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-white">보고서에만 쓰는 항목</h2>
                <p className="text-sm text-gray-500 mt-1">
                    워크시트에 저장할 자리가 없는 항목입니다. 저장되지 않으니 생성 전에 채워 주세요.
                </p>
            </div>
            <label className="block text-sm text-gray-300">
                제품/서비스 이미지
                <input type="file" accept="image/*" onChange={(event) => handleImage(event.target.files?.[0])} className="input-field block mt-1" />
            </label>
            {value.productImageDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- 업로드한 dataURL 미리보기라 최적화 대상이 아니다.
                <img src={value.productImageDataUrl} alt="제품 이미지 미리보기" className="max-h-40 rounded border border-white/10" />
            )}
            {TEXT_FIELDS.map((field) => (
                <label key={field.key} className="block text-sm text-gray-300">
                    {field.label}
                    <textarea
                        value={String(value[field.key] ?? '')}
                        onChange={(event) => updateField(field.key, event.target.value)}
                        placeholder={field.placeholder}
                        rows={2}
                        className="input-field block w-full mt-1"
                    />
                </label>
            ))}
        </div>
    );
}
