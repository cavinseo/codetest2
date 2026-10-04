'use client';
// WS-3 멘토링에서 제품 가치사슬과 가치시스템 분석을 요청하고 표시한다.
import { useState } from 'react';
import { describeAiEngine } from '@/lib/ai/engine-label';
import {
    valueAnalysisResultSchema,
    type AttributeDraftInput,
    type ValueAnalysisContext,
    type ValueAnalysisResult,
} from '@/lib/ai/types';

const POSITION_LABELS = {
    upstream: '공급자', company: '자사', downstream: '유통·전달', customer: '고객', partner: '협력자',
};

interface Props {
    projectId: string;
    context: ValueAnalysisContext;
    answers: AttributeDraftInput['answers'];
}

export default function AttributeValueAnalysis({ projectId, context, answers }: Props) {
    const [result, setResult] = useState<ValueAnalysisResult | null>(null);
    const [isWorking, setIsWorking] = useState(false);
    const [error, setError] = useState('');
    const [engineLabel, setEngineLabel] = useState('');

    const analyze = async () => {
        setIsWorking(true);
        setError('');
        try {
            const response = await fetch(`/api/projects/${projectId}/attributes/mentor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'value-analysis', context, answers }),
            });
            if (!response.ok) throw new Error('가치 분석을 생성하지 못했습니다. 다시 시도해 주세요.');
            const data = await response.json();
            const parsed = valueAnalysisResultSchema.safeParse(data);
            if (!parsed.success) throw new Error('분석 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.');
            setResult(parsed.data);
            setEngineLabel(describeAiEngine(data));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '가치 분석을 생성하지 못했습니다.');
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <section className="space-y-5" aria-label="가치사슬·가치시스템 분석">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h4 className="font-semibold text-white">제품의 가치사슬·가치시스템 분석</h4>
                    <p className="text-xs text-gray-400">제품 설명, WS-2 기능, 현재 WS-3 입력과 문진 답변을 바탕으로 분석합니다.</p>
                    <p className="text-xs text-gray-500">결과는 이 멘토링 창에서 참고할 수 있으며, 창을 닫으면 초기화됩니다.</p>
                </div>
                <button type="button" onClick={analyze} disabled={isWorking} className="btn-primary text-sm disabled:opacity-50">
                    {isWorking ? '분석 중...' : result ? '다시 분석' : '가치 분석하기'}
                </button>
            </div>
            {error && <p role="alert" className="text-sm text-red-400">{error}{result ? ' 이전 분석 결과를 표시합니다.' : ''}</p>}
            {isWorking && <p role="status" className="text-sm text-accent-300">가치창출 활동과 참여자 간 흐름을 분석하고 있습니다.</p>}
            {result && (
                <>
                    <div className="rounded-lg border border-accent-500/20 bg-accent-500/[0.06] p-4">
                        <span className="text-xs text-gray-500">{engineLabel}</span>
                        <p className="mt-2 text-sm text-gray-200 whitespace-pre-wrap">{result.summary}</p>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-white mb-2">가치사슬 — 기업 내부의 가치창출 활동</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] table-fixed text-sm">
                                <thead className="bg-white/[0.03] text-gray-400 text-left">
                                    <tr><th className="p-3 w-[20%]">활동</th><th className="p-3 w-[40%]">현황·니즈·병목</th><th className="p-3">개선 기회</th></tr>
                                </thead>
                                <tbody>
                                    {result.valueChain.map((item, index) => (
                                        <tr key={index} className="border-t border-white/[0.06] align-top">
                                            <td className="p-3 text-gray-200 break-words"><span className="block text-xs text-accent-300 mb-1">{item.category === 'primary' ? '본원활동' : '지원활동'}</span>{item.activity}</td>
                                            <td className="p-3 text-gray-300 whitespace-pre-wrap break-words">{item.analysis}</td>
                                            <td className="p-3 text-gray-300 whitespace-pre-wrap break-words">{item.opportunity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-white mb-2">가치시스템 — 공급자·자사·채널·고객·협력자의 연결</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] table-fixed text-sm">
                                <thead className="bg-white/[0.03] text-gray-400 text-left">
                                    <tr><th className="p-3 w-[20%]">참여자</th><th className="p-3 w-[40%]">가치·정보·대금 흐름</th><th className="p-3">협력 기회·위험</th></tr>
                                </thead>
                                <tbody>
                                    {result.valueSystem.map((item, index) => (
                                        <tr key={index} className="border-t border-white/[0.06] align-top">
                                            <td className="p-3 text-gray-200 break-words"><span className="block text-xs text-accent-300 mb-1">{POSITION_LABELS[item.position]}</span>{item.actor}</td>
                                            <td className="p-3 text-gray-300 whitespace-pre-wrap break-words">{item.valueFlow}</td>
                                            <td className="p-3 text-gray-300 whitespace-pre-wrap break-words">{item.opportunity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-white/[0.08] p-4">
                            <h4 className="text-sm font-semibold text-white">가정·추가 확인사항</h4>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-sm text-gray-400">{result.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul>
                        </div>
                        <div className="rounded-lg border border-white/[0.08] p-4">
                            <h4 className="text-sm font-semibold text-white">다음 실행 과제</h4>
                            <ol className="list-decimal pl-5 mt-2 space-y-2 text-sm text-gray-300">{result.nextActions.map((item, index) => <li key={index}>{item}</li>)}</ol>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}
