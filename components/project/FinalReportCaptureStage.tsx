'use client';
// 보고서의 세 그림 자리에 들어갈 실제 워크시트 결과를 읽기 전용으로 렌더링한다.
import FitnessWrapper from './FitnessWrapper';
import KanoSatisfactionGraph from './KanoSatisfactionGraph';
import QFDMatrix from './QFDMatrix';
import WorksheetImageExport from './WorksheetImageExport';
import type { toKanoChartPoints } from '@/lib/final-report-inputs';

interface Props {
    projectId: string;
    kanoPoints: ReturnType<typeof toKanoChartPoints>;
    requirementCount: number;
    revision: number;
    disabled: boolean;
}

export default function FinalReportCaptureStage({ projectId, kanoPoints, requirementCount, revision, disabled }: Props) {
    const sections = [
        { id: 'fitness', title: '[WS-4] 제품속성적합도', content: <FitnessWrapper key={revision} projectId={projectId} /> },
        { id: 'kano-aggregation', title: '[WS-7] TIMKO/만족계수 그래프', content: kanoPoints.length
            ? <KanoSatisfactionGraph analysis={kanoPoints} />
            : <p className="p-4 text-sm text-gray-400">Kano 응답이 없어 산점도를 그릴 수 없습니다. (요구사항 {requirementCount}개)</p> },
        { id: 'qfd', title: '[WS-9] QFD', content: <QFDMatrix key={revision} projectId={projectId} /> },
    ];
    return <div className="space-y-6">
        <p className="text-sm text-gray-400">아래 실제 결과가 보고서의 해당 그림 자리에 들어갑니다. ‘워크시트 그림 반영’은 교정한 문구와 표를 유지하고 그림만 갱신합니다.</p>
        {sections.map(section => <section key={section.id} className="card p-0">
            <h3 className="border-b border-white/[0.06] px-4 py-3 text-sm font-semibold text-white">{section.title}</h3>
            <WorksheetImageExport title={section.title} worksheetId={section.id} captureWidth={1280} readOnly disabled={disabled}>
                <div className="p-4">{section.content}</div>
            </WorksheetImageExport>
        </section>)}
    </div>;
}
