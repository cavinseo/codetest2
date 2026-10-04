'use client';
// WS-7의 실제 분석 표와 그래프를 조회하여 개별 화면과 그림 다운로드에 제공한다.
import { useEffect, useState, type ComponentProps } from 'react';
import { useParams } from 'next/navigation';
import KanoSatisfactionGraph from '@/components/project/KanoSatisfactionGraph';
import KanoAggregationTable from '@/components/project/KanoAggregationTable';
import { toKanoChartPoints } from '@/lib/final-report-inputs';

type Analysis = ComponentProps<typeof KanoAggregationTable>['analysis'];

export default function KanoAnalysisPage() {
    const projectId = String(useParams().id);
    const [result, setResult] = useState<{ projectId: string; rows: Analysis; error?: string } | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const [analysisResponse, requirementsResponse] = await Promise.all([
                    fetch(`/api/projects/${projectId}/kano/analysis`, { signal: controller.signal }),
                    fetch(`/api/projects/${projectId}/requirements`, { signal: controller.signal }),
                ]);
                if (!analysisResponse.ok || !requirementsResponse.ok) throw new Error('Kano 분석 결과를 불러오지 못했습니다. 화면을 새로고침해 주세요.');
                const [analysis, requirements] = await Promise.all([analysisResponse.json(), requirementsResponse.json()]);
                const names = new Map<string, string>(requirements.requirements.map((row: { id: string; requirement: string }) => [row.id, row.requirement]));
                if (!controller.signal.aborted) setResult({ projectId, rows: analysis.requirements.map((row: Analysis[number]) => ({ ...row, requirementName: names.get(row.requirementId) })) });
            } catch (error) {
                if (!controller.signal.aborted) setResult({ projectId, rows: [], error: error instanceof Error ? error.message : 'Kano 분석 결과를 불러오지 못했습니다.' });
            }
        }
        void load();
        return () => controller.abort();
    }, [projectId]);
    const loading = result?.projectId !== projectId;
    const rows = loading ? [] : result.rows;
    const points = toKanoChartPoints(rows, rows.map(row => ({ id: row.requirementId, requirement: row.requirementName })));
    return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8" data-worksheet-state={loading ? 'loading' : result.error ? 'error' : 'ready'}>
        <h1 className="text-xl font-bold text-white">[WS-7] Kano 분석 집계표</h1>
        {loading ? <p role="status">분석 결과를 불러오는 중입니다.</p>
            : result.error ? <p role="alert" className="text-red-500">{result.error}</p>
            : rows.length ? <><KanoSatisfactionGraph analysis={points} /><KanoAggregationTable analysis={rows} /></>
            : <p className="text-gray-500">Kano 응답이 없어 분석 결과가 없습니다.</p>}
    </main>;
}
