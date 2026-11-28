'use client';

// Kano 분석 결과 탭. TIMKO 차트·집계표와 응답자별 보기를 그린다.
// KanoManager 한 파일에 1600줄이 몰려 있어 떼어 냈다(2026-10-25 코드 리뷰 L1). 보기 모드는
// 설문 관리 탭의 "응답 결과 보기"도 바꾸므로 KanoManager 가 들고 넘겨준다.
import Kano2DChart from '@/components/Kano2DChart';
import KanoAggregationTable from '@/components/project/KanoAggregationTable';
import KanoRespondentTable from '@/components/project/KanoRespondentTable';
import TimkoCoefficientChart from '@/components/project/TimkoCoefficientChart';
import type { KanoQuestionableSummary } from '@/lib/kano-questionable-summary';

export interface KanoAnalysisResult {
    requirementId: string;
    responseCount: number;
    aggregated: {
        M: number;
        O: number;
        A: number;
        I: number;
        R: number;
        Q: number;
        total: number;
        dominantCategory: any;
    };
    better: number;
    worse: number;
    kanoWeight?: number | null;
    timkoCategory?: string | null;
    quadrant: string;
}

export interface KanoAnalysisData {
    totalResponses: number;
    uniqueRespondents: number;
    requirements: KanoAnalysisResult[];
    questionable?: KanoQuestionableSummary;
}

export type KanoAnalysisViewMode = 'list' | 'charts' | 'respondents';

export interface KanoAnalysisPanelProps {
    projectId: string;
    /** 가중치 저장은 담당 멘토만 한다. 서버 판정을 받지 못했으면 읽기 전용으로 둔다. */
    canEdit?: boolean;
    /** 응답 삭제 권한. 없으면 리셋·응답자별 삭제 버튼을 숨긴다. */
    canDeleteResponses?: boolean;
    analysis: KanoAnalysisData | null;
    requirements: Array<{ id: string; requirement: string }>;
    respondentData: any[];
    analysisViewMode: KanoAnalysisViewMode;
    setAnalysisViewMode: (mode: KanoAnalysisViewMode) => void;
    /** 응답이 없을 때 설문 관리 탭으로 보낸다. */
    onGoToManage: () => void;
    handleResetResponses: () => void;
    isResettingResponses: boolean;
    /** 삭제가 진행되는 동안 보기 전환을 막아, 지우는 중인 목록에서 다른 조작이 섞이지 않게 한다. */
    isDeletingCurrentProject?: boolean;
    /** 응답자별 보기에서 고른 응답자(없으면 전체)의 응답을 지운다. */
    onDeleteRespondents?: (respondentEmails?: string[]) => Promise<void>;
    /** 집계표에서 가중치를 저장한 뒤 다시 불러온다. */
    loadData: () => Promise<void>;
}

export default function KanoAnalysisPanel({
    projectId, canEdit = false, canDeleteResponses = false, analysis, requirements, respondentData,
    analysisViewMode, setAnalysisViewMode, onGoToManage, handleResetResponses, isResettingResponses,
    isDeletingCurrentProject = false, onDeleteRespondents, loadData,
}: KanoAnalysisPanelProps) {
    const getRequirementInfo = (reqId: string) => requirements.find(r => r.id === reqId);

    return (
        <div className="space-y-6 animate-fade-in">
            {!analysis || analysis.totalResponses === 0 ? (
                <div className="card text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-display font-semibold text-gray-300 mb-2">아직 응답이 없습니다</h3>
                    <p className="text-gray-500 text-sm mb-6">응답자를 초대하고 설문 응답을 수집하세요</p>
                    <button onClick={onGoToManage} className="btn-primary inline-flex">
                        설문 관리로 이동
                    </button>
                </div>
            ) : (
                <>
                    {/* 분석 통계 */}
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: '총 응답 수', value: `${analysis.totalResponses}개`, color: 'text-blue-400' },
                            { label: '응답자 수', value: `${analysis.uniqueRespondents}명`, color: 'text-emerald-400' },
                            { label: '분석 항목', value: `${analysis.requirements.length}개`, color: 'text-purple-400' },
                        ].map(item => (
                            <div key={item.label} className="card text-center">
                                <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                                <p className={`text-2xl font-bold font-display ${item.color}`}>{item.value}</p>
                            </div>
                        ))}
                    </div>

                    {canDeleteResponses && <div className="flex justify-end">
                        <button
                            onClick={handleResetResponses}
                            disabled={isResettingResponses || analysis.totalResponses === 0}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50 disabled:hover:bg-red-500/10"
                        >
                            {isResettingResponses ? (
                                <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3m-8 0h10" />
                                </svg>
                            )}
                            응답 데이터 리셋
                        </button>
                    </div>}

                    {/* 보기 토글 */}
                    <div className="flex justify-center">
                        <div className="flex gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl flex-wrap">
                            <button
                                onClick={() => setAnalysisViewMode('charts')}
                                disabled={isDeletingCurrentProject}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${analysisViewMode === 'charts' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'}`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                                </svg>
                                TIMKO
                            </button>
                            <button
                                onClick={() => setAnalysisViewMode('respondents')}
                                disabled={isDeletingCurrentProject}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${analysisViewMode === 'respondents' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'}`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                응답자별 보기
                            </button>
                        </div>
                    </div>


                    {/* 차트 뷰 */}
                    {analysisViewMode === 'charts' && (
                        <div className="space-y-6">
                            <div className="card">
                                <h3 className="text-lg font-display font-bold text-white mb-4">TIMKO 분석 차트</h3>
                                <div className="flex justify-center">
                                    <Kano2DChart
                                        requirements={analysis.requirements.map((result, idx) => {
                                            const reqInfo = getRequirementInfo(result.requirementId);
                                            const dominantCategory = Object.entries(result.aggregated).reduce(
                                                (max, [cat, count]) => count > max.count ? { category: cat, count } : max,
                                                { category: 'I', count: 0 }
                                            );
                                            return {
                                                id: result.requirementId,
                                                name: reqInfo?.requirement || `요구사항 ${idx + 1}`,
                                                better: result.better,
                                                worse: result.worse,
                                                category: dominantCategory.category,
                                            };
                                        })}
                                    />
                                </div>
                            </div>
                            <TimkoCoefficientChart analysis={analysis.requirements.map(req => ({
                                ...req,
                                requirementName: getRequirementInfo(req.requirementId)?.requirement
                            }))} />
                            {/* 집계표는 projectId 가 없으면 가중치를 저장하지 않는 읽기 전용으로 그린다. */}
                            <KanoAggregationTable
                                projectId={canEdit ? projectId : undefined}
                                onWeightsSaved={loadData}
                                questionable={analysis.questionable}
                                analysis={analysis.requirements.map(req => ({
                                    ...req,
                                    requirementName: getRequirementInfo(req.requirementId)?.requirement
                                }))}
                            />
                        </div>
                    )}

                    {/* 집계표 표 뷰 */}
                    {/* 제출자별 보기 */}
                    {analysisViewMode === 'respondents' && (
                        <KanoRespondentTable
                            key={projectId}
                            respondents={respondentData}
                            requirements={requirements}
                            canDelete={canDeleteResponses}
                            isDeleting={isResettingResponses}
                            onDelete={onDeleteRespondents}
                        />
                    )}
                </>
            )}
        </div>
    );
}
