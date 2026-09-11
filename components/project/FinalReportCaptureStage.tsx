'use client';
// 표로 재현하기 어려운 세 워크시트를 그림으로 캡처하려고 그대로 그려 두는 자리다.
//
// 문서에 들어가는 것은 여기 그려진 화면을 그대로 찍은 PNG 다. 그래서 캡처하는
// 쪽(결과보고서 화면)이 data-worksheet-id 로 이 상자들을 찾는다 — 그 값과 폭을
// 바꾸면 캡처가 빗나가므로 한 곳에 모아 둔다.
import type { ReactNode } from 'react';
import FitnessWrapper from '@/components/project/FitnessWrapper';
import KanoSatisfactionGraph from '@/components/project/KanoSatisfactionGraph';
import QFDMatrix from '@/components/project/QFDMatrix';
import type { toKanoChartPoints } from '@/lib/final-report-inputs';

/** 캡처 컨테이너의 고정 폭. 화면 폭에 따라 캡처 결과가 달라지지 않게 한다. */
const CAPTURE_WIDTH_PX = 1280;

interface Props {
    projectId: string;
    kanoPoints: ReturnType<typeof toKanoChartPoints>;
    requirementCount: number;
}

function CaptureSection({ title, worksheetId, children }: { title: string; worksheetId: string; children: ReactNode }) {
    return (
        <section className="card p-0 overflow-hidden">
            <h3 className="px-4 py-3 text-sm font-semibold text-white border-b border-white/[0.06]">{title}</h3>
            <div data-worksheet-id={worksheetId} style={{ width: CAPTURE_WIDTH_PX }} className="p-4">
                {children}
            </div>
        </section>
    );
}

export default function FinalReportCaptureStage({ projectId, kanoPoints, requirementCount }: Props) {
    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-500">
                아래 세 화면이 그대로 그림으로 들어갑니다. 값이 다 나온 뒤에 「미리보기 만들기」를 누르세요.
            </p>

            <CaptureSection title="[WS-4] 제품속성적합도" worksheetId="fitness">
                <FitnessWrapper projectId={projectId} />
            </CaptureSection>

            <CaptureSection title="[WS-7] TIMKO/만족계수 그래프" worksheetId="kano-aggregation">
                {kanoPoints.length > 0
                    ? <KanoSatisfactionGraph analysis={kanoPoints} />
                    : <p className="text-sm text-gray-500">Kano 응답이 없어 산점도를 그릴 수 없습니다. (요구사항 {requirementCount}개)</p>}
            </CaptureSection>

            <CaptureSection title="[WS-9] QFD" worksheetId="qfd">
                <QFDMatrix projectId={projectId} />
            </CaptureSection>
        </div>
    );
}
