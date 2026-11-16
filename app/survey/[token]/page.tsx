'use client';
// 공개 Kano 설문의 전체 HTML 문항을 표시하고 토큰으로 응답을 제출한다.

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { KANO_ANSWER_SCORE, type KanoAnswer } from '@/lib/constants';
import {
    KANO_SURVEY_CLOSING,
    KANO_SURVEY_GUIDE,
    KANO_SURVEY_TITLE,
    kanoSurveyAnswerLabels,
    resolveKanoQuestionPair,
} from '@/lib/kano-survey-document';

interface Requirement {
    id: string;
    category: string;
    subcategory?: string;
    requirement: string;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
    order: number;
}

interface SurveyData {
    projectName: string;
    introduction: string;
    requirements: Requirement[];
}

type AnswerType = 'functional' | 'dysfunctional';
const answerLabels = kanoSurveyAnswerLabels();
const answerOptions = Object.entries(KANO_ANSWER_SCORE).map(([value, score]) => ({
    value: value as KanoAnswer,
    label: answerLabels[score - 1],
}));

interface SurveyLoadError {
    title: string;
    message: string;
    /** 일시적인 실패라 다시 시도하면 열릴 수 있는가 */
    retryable: boolean;
}

// 서버는 만료(410)·이미 응답(400)·없음(404)을 구분해 알려 주는데, 화면이 전부 "찾을 수
// 없습니다"로 뭉개 응답자는 링크가 잘못된 줄 알고 다시 요청하거나, 이미 낸 응답을 못
// 냈다고 생각했다(2026-10-25 코드 리뷰 B18). 상태별로 제목을 고르고 서버 문구를 보인다.
function surveyLoadError(status: number, serverMessage: string | undefined): SurveyLoadError {
    if (status === 410) {
        return { title: '설문 링크가 만료되었습니다', message: serverMessage || '설문 링크가 만료되었습니다.', retryable: false };
    }
    if (status === 400) {
        return { title: '이미 응답한 설문입니다', message: serverMessage || '이미 응답을 완료하셨습니다.', retryable: false };
    }
    if (status === 404) {
        return { title: '설문을 찾을 수 없습니다', message: serverMessage || '유효하지 않은 설문 링크입니다.', retryable: false };
    }
    return { title: '설문을 불러오지 못했습니다', message: '잠시 후 다시 시도해 주세요.', retryable: true };
}

export default function SurveyPage() {
    const params = useParams();
    const router = useRouter();
    const token = params.token as string;

    const [surveyData, setSurveyData] = useState<SurveyData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [answers, setAnswers] = useState<Record<string, Partial<Record<AnswerType, KanoAnswer>>>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadError, setLoadError] = useState<SurveyLoadError | null>(null);
    const submissionPending = useRef(false);

    const loadSurvey = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const response = await fetch(`/api/survey/${token}`);
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                setLoadError(surveyLoadError(response.status, data?.error));
                return;
            }
            const data = await response.json();
            setSurveyData(data);
        } catch {
            setLoadError(surveyLoadError(0, undefined));
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadSurvey();
    }, [loadSurvey]);

    const handleAnswer = (requirementId: string, type: AnswerType, value: KanoAnswer) => {
        setAnswers(previous => ({
            ...previous,
            [requirementId]: {
                ...previous[requirementId],
                [type]: value,
            },
        }));
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!surveyData || submissionPending.current) return;

        const allAnswered = surveyData.requirements.every((requirement) => {
            const answer = answers[requirement.id];
            return answer?.functional && answer?.dysfunctional;
        });
        if (!allAnswered) {
            alert('모든 질문에 답변해주세요.');
            return;
        }

        submissionPending.current = true;
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/survey/${token}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || errorData.message || '응답 제출 실패');
            }

            alert('설문 응답이 완료되었습니다. 감사합니다!');
            router.push('/');
        } catch (error: unknown) {
            alert(error instanceof Error ? error.message : '응답 제출 실패');
        } finally {
            submissionPending.current = false;
            setIsSubmitting(false);
        }
    };

    return (
        <div className="kano-online-survey">
            <style>{`
                .kano-online-survey { min-height: 100vh; padding: 32px 0; background: #f3f4f6; color: #111827; font-family: Arial, "Malgun Gothic", sans-serif; line-height: 1.55; color-scheme: light; }
                .kano-online-survey .survey-paper { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 40px; background: #fff; border-radius: 16px; }
                .kano-online-survey h1, .kano-online-survey .survey-status h2 { margin: 0 0 8px; font-size: 30px; font-family: inherit; font-weight: 700; }
                .kano-online-survey .project-name { margin: 0 0 24px; color: #4b5563; }
                .kano-online-survey .guide, .kano-online-survey .introduction, .kano-online-survey .closing { margin: 16px 0; white-space: pre-wrap; }
                .kano-online-survey .requirement { margin: 28px 0; padding-top: 8px; border-top: 1px solid #d1d5db; }
                .kano-online-survey fieldset { margin: 18px 0; padding: 16px; border: 1px solid #d1d5db; border-radius: 10px; }
                .kano-online-survey legend { padding: 0 8px; font-weight: 500; }
                .kano-online-survey legend strong { margin-right: 8px; color: #1d4ed8; }
                .kano-online-survey .answers { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
                .kano-online-survey .answer { display: flex; gap: 6px; align-items: flex-start; padding: 8px; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; }
                .kano-online-survey input[type="radio"] { margin-top: 5px; accent-color: #2563eb; }
                .kano-online-survey .survey-button { display: inline-block; padding: 12px 20px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
                .kano-online-survey .survey-button:disabled { opacity: 0.6; cursor: wait; }
                .kano-online-survey .survey-status { text-align: center; }
                .kano-online-survey .survey-status p { margin: 16px 0 24px; }
                @media (max-width: 720px) { .kano-online-survey .survey-paper { padding: 22px; } .kano-online-survey .answers { grid-template-columns: 1fr; } }
            `}</style>
            {isLoading ? (
                <main className="survey-paper survey-status" role="status">설문 로딩 중...</main>
            ) : loadError || !surveyData ? (
                (() => {
                    // 만료·이미 응답·없음을 구분해 보여 줘야 응답자가 링크를 다시 요청하거나 중복 응답을 시도하지 않는다.
                    const shown = loadError ?? surveyLoadError(404, undefined);
                    return (
                        <main className="survey-paper survey-status" role="alert">
                            <h2>{shown.title}</h2>
                            <p>{shown.message}</p>
                            {shown.retryable && (
                                <button type="button" className="survey-button" onClick={() => void loadSurvey()} style={{ marginRight: 8 }}>
                                    다시 시도
                                </button>
                            )}
                            <Link href="/" className="survey-button">홈으로 이동</Link>
                        </main>
                    );
                })()
            ) : (
                <main className="survey-paper">
                    <header>
                        <h1>{KANO_SURVEY_TITLE}</h1>
                        <p className="project-name">{surveyData.projectName}</p>
                        <p className="guide">{KANO_SURVEY_GUIDE}</p>
                        <p className="introduction">{surveyData.introduction}</p>
                    </header>
                    <form onSubmit={handleSubmit} aria-busy={isSubmitting}>
                        {surveyData.requirements.map((requirement, index) => {
                            const pair = resolveKanoQuestionPair(requirement);
                            const questions = [
                                { type: 'functional', suffix: 1, text: pair.positive },
                                { type: 'dysfunctional', suffix: 2, text: pair.negative },
                            ] as const;
                            return (
                                <section key={requirement.id} className="requirement">
                                    {questions.map(question => (
                                        <fieldset key={question.type} disabled={isSubmitting}>
                                            <legend><strong>{index + 1}-{question.suffix}</strong>{' '}{question.text}</legend>
                                            <div className="answers">
                                                {answerOptions.map(option => {
                                                    const id = `${requirement.id}-${question.type}-${option.value}`;
                                                    return (
                                                        <label key={option.value} className="answer" htmlFor={id}>
                                                            <input
                                                                id={id}
                                                                type="radio"
                                                                name={`${requirement.id}-${question.type}`}
                                                                value={option.value}
                                                                required
                                                                checked={answers[requirement.id]?.[question.type] === option.value}
                                                                onChange={() => handleAnswer(requirement.id, question.type, option.value)}
                                                            />
                                                            <span>{option.label}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </fieldset>
                                    ))}
                                </section>
                            );
                        })}
                        <button type="submit" className="survey-button" disabled={isSubmitting}>
                            {isSubmitting ? '제출 중...' : '제출하기'}
                        </button>
                    </form>
                    <p className="closing">{KANO_SURVEY_CLOSING}</p>
                </main>
            )}
        </div>
    );
}
