'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Requirement {
    id: string;
    category: string;
    subcategory?: string;
    requirement: string;
    order: number;
}

interface SurveyData {
    projectName: string;
    requirements: Requirement[];
    respondentEmail: string;
}

type KanoAnswer = 'LIKE' | 'EXPECT' | 'NEUTRAL' | 'TOLERATE' | 'DISLIKE';

export default function SurveyPage() {
    const params = useParams();
    const router = useRouter();
    const token = params.token as string;

    const [surveyData, setSurveyData] = useState<SurveyData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, { functional: KanoAnswer; dysfunctional: KanoAnswer }>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadSurvey();
    }, [token]);

    const loadSurvey = async () => {
        try {
            const response = await fetch(`/api/survey/${token}`);
            if (!response.ok) {
                throw new Error('설문을 찾을 수 없습니다. 링크가 만료되었거나 잘못되었습니다.');
            }
            const data = await response.json();
            setSurveyData(data);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnswer = (type: 'functional' | 'dysfunctional', value: KanoAnswer) => {
        const reqId = surveyData?.requirements[currentIndex].id;
        if (!reqId) return;

        setAnswers({
            ...answers,
            [reqId]: {
                ...answers[reqId],
                [type]: value,
            },
        });
    };

    const handleNext = () => {
        if (!surveyData) return;

        const reqId = surveyData.requirements[currentIndex].id;
        const answer = answers[reqId];

        if (!answer?.functional || !answer?.dysfunctional) {
            alert('모든 질문에 답변해주세요.');
            return;
        }

        if (currentIndex < surveyData.requirements.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    const handleSubmit = async () => {
        if (!surveyData) return;

        // 모든 답변 확인
        const allAnswered = surveyData.requirements.every((req) => {
            const answer = answers[req.id];
            return answer?.functional && answer?.dysfunctional;
        });

        if (!allAnswered) {
            alert('모든 질문에 답변해주세요.');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/survey/${token}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers }),
            });

            if (!response.ok) {
                throw new Error('응답 제출 실패');
            }

            alert('설문 응답이 완료되었습니다. 감사합니다!');
            router.push('/');
        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const answerOptions: { value: KanoAnswer; label: string; emoji: string }[] = [
        { value: 'LIKE', label: '매우 만족', emoji: '😍' },
        { value: 'EXPECT', label: '당연함', emoji: '😊' },
        { value: 'NEUTRAL', label: '상관없음', emoji: '😐' },
        { value: 'TOLERATE', label: '견딜만함', emoji: '😕' },
        { value: 'DISLIKE', label: '매우 불만', emoji: '😠' },
    ];

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-white text-xl">설문 로딩 중...</div>
            </div>
        );
    }

    if (error || !surveyData) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
                <div className="card max-w-md text-center">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-2xl font-bold text-white mb-4">설문을 찾을 수 없습니다</h2>
                    <p className="text-gray-400 mb-6">{error || '유효하지 않은 링크입니다.'}</p>
                    <a href="/" className="btn-primary inline-block">
                        홈으로 이동
                    </a>
                </div>
            </div>
        );
    }

    const currentReq = surveyData.requirements[currentIndex];
    const currentAnswer = answers[currentReq.id];
    const progress = ((currentIndex + 1) / surveyData.requirements.length) * 100;
    const isLastQuestion = currentIndex === surveyData.requirements.length - 1;

    return (
        <div className="min-h-screen bg-gray-900">
            {/* 헤더 */}
            <header className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-white mb-2">Kano 설문 조사</h1>
                        <p className="text-gray-400">{surveyData.projectName}</p>
                    </div>
                </div>
            </header>

            {/* 진행률 */}
            <div className="bg-gray-800/50">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">
                            질문 {currentIndex + 1} / {surveyData.requirements.length}
                        </span>
                        <span className="text-sm text-blue-400 font-semibold">{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* 메인 콘텐츠 */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="space-y-8">
                    {/* 요구사항 설명 */}
                    <div className="card">
                        <div className="flex items-start space-x-4">
                            <div className="text-3xl">💡</div>
                            <div className="flex-1">
                                {currentReq.category && (
                                    <span className="text-sm text-blue-400 font-semibold">
                                        {currentReq.category}
                                        {currentReq.subcategory && ` > ${currentReq.subcategory}`}
                                    </span>
                                )}
                                <h2 className="text-2xl font-bold text-white mt-2">{currentReq.requirement}</h2>
                            </div>
                        </div>
                    </div>

                    {/* 긍정 질문 */}
                    <div className="card">
                        <div className="mb-4">
                            <div className="flex items-center space-x-2 mb-2">
                                <span className="text-2xl">👍</span>
                                <h3 className="text-lg font-bold text-white">긍정 질문</h3>
                            </div>
                            <p className="text-gray-300">
                                만약 <strong className="text-blue-400">{currentReq.requirement}</strong> 기능이{' '}
                                <strong className="text-green-400">있다면</strong> 어떻게 느끼시겠습니까?
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {answerOptions.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => handleAnswer('functional', option.value)}
                                    className={`
                    p-4 rounded-lg border-2 transition-all text-left
                    ${currentAnswer?.functional === option.value
                                            ? 'border-blue-500 bg-blue-500/20'
                                            : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
                                        }
                  `}
                                >
                                    <span className="text-2xl mr-3">{option.emoji}</span>
                                    <span className="text-white font-medium">{option.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 부정 질문 */}
                    <div className="card">
                        <div className="mb-4">
                            <div className="flex items-center space-x-2 mb-2">
                                <span className="text-2xl">👎</span>
                                <h3 className="text-lg font-bold text-white">부정 질문</h3>
                            </div>
                            <p className="text-gray-300">
                                만약 <strong className="text-blue-400">{currentReq.requirement}</strong> 기능이{' '}
                                <strong className="text-red-400">없다면</strong> 어떻게 느끼시겠습니까?
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {answerOptions.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => handleAnswer('dysfunctional', option.value)}
                                    className={`
                    p-4 rounded-lg border-2 transition-all text-left
                    ${currentAnswer?.dysfunctional === option.value
                                            ? 'border-blue-500 bg-blue-500/20'
                                            : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
                                        }
                  `}
                                >
                                    <span className="text-2xl mr-3">{option.emoji}</span>
                                    <span className="text-white font-medium">{option.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 네비게이션 */}
                    <div className="flex justify-between">
                        <button
                            onClick={handlePrevious}
                            disabled={currentIndex === 0}
                            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            ← 이전
                        </button>
                        {!isLastQuestion ? (
                            <button onClick={handleNext} className="btn-primary">
                                다음 →
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="btn-primary disabled:opacity-50"
                            >
                                {isSubmitting ? '제출 중...' : '제출하기 ✓'}
                            </button>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
