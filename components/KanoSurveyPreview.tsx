'use client';

interface Requirement {
    id: string;
    category: string;
    subcategory?: string;
    requirement: string;
    order: number;
}

interface KanoSurveyPreviewProps {
    projectName: string;
    requirements: Requirement[];
    onClose: () => void;
}

const answerOptions = [
    { value: 'LIKE', label: '매우 만족', emoji: '😍' },
    { value: 'EXPECT', label: '당연함', emoji: '😊' },
    { value: 'NEUTRAL', label: '상관없음', emoji: '😐' },
    { value: 'TOLERATE', label: '견딜만함', emoji: '😕' },
    { value: 'DISLIKE', label: '매우 불만', emoji: '😠' },
];

export default function KanoSurveyPreview({ projectName, requirements, onClose }: KanoSurveyPreviewProps) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center overflow-y-auto z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8">
                {/* 폼 헤더 - 구글 Forms 스타일 */}
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-xl p-1">
                    <div className="bg-white rounded-t-lg p-8">
                        <h1 className="text-3xl font-bold text-gray-800 mb-2">
                            Kano 설문 조사
                        </h1>
                        <p className="text-gray-600 text-lg mb-4">{projectName}</p>
                        <div className="border-t border-gray-200 pt-4">
                            <p className="text-sm text-gray-500">
                                이 설문은 제품/서비스의 각 기능에 대한 고객 만족도를 측정하기 위한 Kano 모델 기반 설문입니다.
                                각 기능에 대해 <strong>긍정 질문</strong>(기능이 있을 때)과 <strong>부정 질문</strong>(기능이 없을 때) 두 가지에 답변해 주세요.
                            </p>
                        </div>
                        <div className="mt-4 bg-red-50 border-l-4 border-red-500 p-3 rounded">
                            <p className="text-sm text-red-700">* 표시는 필수 질문입니다</p>
                        </div>
                    </div>
                </div>

                {/* 설문 질문들 */}
                <div className="p-6 space-y-6">
                    {requirements.map((req, index) => (
                        <div key={req.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                            {/* 질문 카드 상단 바 */}
                            <div className="h-1 bg-gradient-to-r from-purple-500 to-blue-500" />

                            <div className="p-6">
                                {/* 질문 번호와 카테고리 */}
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded">
                                        Q{index + 1}
                                    </span>
                                    {req.category && (
                                        <span className="text-xs text-gray-500">
                                            {req.category}{req.subcategory && ` > ${req.subcategory}`}
                                        </span>
                                    )}
                                </div>

                                <h3 className="text-lg font-semibold text-gray-800 mb-6">
                                    {req.requirement}
                                </h3>

                                {/* 긍정 질문 */}
                                <div className="mb-6">
                                    <p className="text-gray-700 mb-3 flex items-center gap-1">
                                        <span className="text-green-600 font-medium">👍 긍정 질문:</span>
                                        만약 이 기능이 <strong className="text-green-600">있다면</strong> 어떻게 느끼시겠습니까?
                                        <span className="text-red-500">*</span>
                                    </p>
                                    <div className="space-y-2 ml-4">
                                        {answerOptions.map((option) => (
                                            <label key={option.value} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name={`functional_${req.id}`}
                                                    value={option.value}
                                                    disabled
                                                    className="w-4 h-4 text-purple-600"
                                                />
                                                <span className="text-gray-700">
                                                    {option.emoji} {option.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* 구분선 */}
                                <hr className="my-4 border-gray-200" />

                                {/* 부정 질문 */}
                                <div>
                                    <p className="text-gray-700 mb-3 flex items-center gap-1">
                                        <span className="text-red-600 font-medium">👎 부정 질문:</span>
                                        만약 이 기능이 <strong className="text-red-600">없다면</strong> 어떻게 느끼시겠습니까?
                                        <span className="text-red-500">*</span>
                                    </p>
                                    <div className="space-y-2 ml-4">
                                        {answerOptions.map((option) => (
                                            <label key={option.value} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name={`dysfunctional_${req.id}`}
                                                    value={option.value}
                                                    disabled
                                                    className="w-4 h-4 text-purple-600"
                                                />
                                                <span className="text-gray-700">
                                                    {option.emoji} {option.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* 제출 버튼 (미리보기이므로 비활성화) */}
                    <div className="flex items-center justify-between pt-4">
                        <button
                            disabled
                            className="bg-purple-600 text-white px-8 py-3 rounded-md font-medium opacity-50 cursor-not-allowed"
                        >
                            제출
                        </button>
                        <p className="text-xs text-gray-400">이 양식은 미리보기입니다</p>
                    </div>
                </div>

                {/* 닫기 버튼 */}
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4 rounded-b-xl flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-gray-800 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-700 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
