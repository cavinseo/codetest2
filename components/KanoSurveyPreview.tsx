'use client';

import { getKanoTopic } from '@/lib/utils/korean-utils';

interface Requirement {
    id: string;
    category: string;
    subcategory?: string;
    requirement: string;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
    order: number;
}

interface KanoSurveyPreviewProps {
    projectName: string;
    requirements: Requirement[];
    onClose: () => void;
}

const answerOptions = [
    { value: 'LIKE', label: '마음에 든다' },
    { value: 'EXPECT', label: '당연하다' },
    { value: 'NEUTRAL', label: '아무런느낌이 없다' },
    { value: 'TOLERATE', label: '하는수 없다' },
    { value: 'DISLIKE', label: '마음에 안든다' },
];

export default function KanoSurveyPreview({ projectName, requirements, onClose }: KanoSurveyPreviewProps) {
    return (
        <div className="kano-survey-preview fixed inset-0 bg-black/70 flex items-start justify-center overflow-y-auto z-50 p-4">
            <div className="kano-survey-preview-paper bg-white rounded-xl shadow-2xl max-w-[64.4rem] w-full my-8">
                {/* 폼 헤더 */}
                <div className="bg-[#673ab7] h-3 rounded-t-xl" />
                <div className="p-8 border-b border-gray-200">
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">
                        Kano 모델 기반 고객 만족도 조사
                    </h1>
                    <div className="bg-purple-50 text-purple-800 px-4 py-2 rounded-lg inline-block font-medium mb-6">
                        프로젝트: {projectName}
                    </div>

                    <div className="space-y-4 text-gray-600 leading-relaxed">
                        <p>
                            안녕하세요! 본 설문은 제품의 각 기능이 제공되었을 때와 제공되지 않았을 때
                            여러분이 느끼시는 만족도를 파악하기 위한 조사입니다.
                        </p>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                            <p className="font-bold text-gray-800 mb-2">💡 응답 요령:</p>
                            <ul className="list-disc list-inside space-y-1">
                                <li>각 기능에 대해 <strong>긍정 질문(있는 경우)</strong>과 <strong>부정 질문(없는 경우)</strong> 두 가지에 모두 답해 주세요.</li>
                                <li>평소에 느끼시거나 기대하시는 바를 솔직하게 선택해 주시면 큰 도움이 됩니다.</li>
                            </ul>
                        </div>
                        <div className="bg-red-50 border-l-4 border-red-400 p-3 rounded text-sm text-red-700">
                            * 표시는 필수 항목입니다
                        </div>
                    </div>
                </div>

                {/* 설문 본문 */}
                <div className="p-8 space-y-10">
                    {requirements.map((req, index) => {
                        const topic = getKanoTopic(req.requirement);
                        // DB에 저장된 질문 우선, 없으면 자동 생성
                        const positiveQ = req.kanoPositiveQ || `${topic}(이)라면 어떻게 생각하십니까?`;
                        const negativeQ = req.kanoNegativeQ || `${topic}(이)가 아니라면 어떻게 생각하십니까?`;

                        return (
                            <div key={req.id} className="animate-fade-in group">
                                {/* 기능 타이틀 */}
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="flex-shrink-0 w-10 h-10 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center font-bold text-lg">
                                        {index + 1}
                                    </div>
                                    <div className="flex-1 pt-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            {req.category && (
                                                <span className="text-xs font-semibold text-purple-500 uppercase tracking-wider bg-purple-50 px-2 py-0.5 rounded">
                                                    {req.category}
                                                </span>
                                            )}
                                            <span className="text-xs text-gray-400">주제: {topic}</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-800">
                                            {req.requirement}
                                        </h3>
                                    </div>
                                </div>

                                {/* 문항 카드 */}
                                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                    {/* 긍정 질문 */}
                                    <div className="p-6 border-b border-gray-100">
                                        <p className="text-gray-800 font-semibold mb-5 flex items-center gap-2">
                                            <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0"></span>
                                            Q{index+1}-1. {positiveQ}
                                            <span className="text-red-500 ml-1">*</span>
                                        </p>
                                        <div className="grid grid-cols-5 gap-2">
                                            {answerOptions.map((option) => (
                                                <label key={option.value} className="flex flex-col items-center gap-2 cursor-pointer group/opt hover:bg-gray-50 p-2 rounded-lg transition-colors">
                                                    <input type="radio" name={`func_${req.id}`} disabled className="w-4 h-4 text-purple-600" />
                                                    <span className="text-[11px] text-gray-500 text-center">
                                                        <span className="font-medium">{option.label}</span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 부정 질문 */}
                                    <div className="p-6 bg-gray-50/50">
                                        <p className="text-gray-800 font-semibold mb-5 flex items-center gap-2">
                                            <span className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0"></span>
                                            Q{index+1}-2. {negativeQ}
                                            <span className="text-red-500 ml-1">*</span>
                                        </p>
                                        <div className="grid grid-cols-5 gap-2">
                                            {answerOptions.map((option) => (
                                                <label key={option.value} className="flex flex-col items-center gap-2 cursor-pointer group/opt hover:bg-gray-50 p-2 rounded-lg transition-colors">
                                                    <input type="radio" name={`dysfunc_${req.id}`} disabled className="w-4 h-4 text-purple-600" />
                                                    <span className="text-[11px] text-gray-500 text-center">
                                                        <span className="font-medium">{option.label}</span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* 하단 안내 */}
                    <div className="flex flex-col items-center justify-center py-10 border-t border-gray-100 mt-10">
                        <button
                            disabled
                            className="bg-[#673ab7] text-white px-12 py-4 rounded-lg font-bold text-lg shadow-lg opacity-50 cursor-not-allowed mb-4"
                        >
                            설문 제출하기
                        </button>
                        <p className="text-sm text-gray-400 italic">본 설문지는 미리보기 모드입니다. 실제 응답은 저장되지 않습니다.</p>
                    </div>
                </div>

                {/* 하단 제어바 */}
                <div className="kano-survey-preview-controls sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 p-4 rounded-b-xl flex justify-end gap-3 z-10">
                    <button
                        onClick={() => window.print()}
                        className="bg-[#673ab7] text-white px-6 py-2.5 rounded-lg font-bold hover:bg-[#5e35a6] transition-colors"
                    >
                        PDF 출력
                    </button>
                    <button
                        onClick={onClose}
                        className="bg-gray-100 text-gray-700 px-6 py-2.5 rounded-lg font-bold hover:bg-gray-200 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
            <style jsx global>{`
                @media print {
                    body {
                        background: #ffffff !important;
                    }

                    body * {
                        visibility: hidden !important;
                    }

                    .kano-survey-preview,
                    .kano-survey-preview * {
                        visibility: visible !important;
                    }

                    .kano-survey-preview {
                        position: static !important;
                        display: block !important;
                        overflow: visible !important;
                        background: #ffffff !important;
                        padding: 0 !important;
                    }

                    .kano-survey-preview-paper {
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                    }

                    .kano-survey-preview-controls {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
