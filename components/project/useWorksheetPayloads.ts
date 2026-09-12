'use client';
// 결과보고서 한 부를 만드는 데 필요한 워크시트 응답 열두 개를 모아 온다.
//
// 화면 안에 두면 "어디까지 받았는지", "무엇이 실패했는지"를 재는 상태 셋이
// 화면 상태와 섞여 어느 것이 보고서 내용이고 어느 것이 적재 진행인지 흐려진다.
// 적재는 여기서 끝내고 화면은 결과만 받는다.
import { useEffect, useState } from 'react';

/**
 * 한 라우트가 늦어도 화면 전체가 멈추지 않도록 끊는 시간.
 * 넉넉히 잡은 이유는 dev 서버가 이 화면에서 처음 열두 라우트를 그 자리에서
 * 컴파일하기 때문이다. 짧게 끊으면 첫 진입에서 모든 절이 빈 채로 그려진다.
 * 컴파일이 끝난 뒤와 배포판에서는 이 시간까지 갈 일이 없다.
 */
const FETCH_TIMEOUT_MS = 60000;

/**
 * 한 번에 던지는 요청 수. 열두 개를 한꺼번에 던지면 원격 DB 쪽 커넥션이 모자라
 * 전부 대기에 걸린다. 서너 개씩 끊어 보내면 끝나는 대로 진행 수가 올라가
 * 어디서 막히는지도 보인다.
 */
const BATCH_SIZE = 3;

/** 보고서가 읽는 워크시트 라우트. 키 이름이 화면의 "못 불러온 목록"에 그대로 나온다. */
function buildRouteUrls(projectId: string) {
    const base = `/api/projects/${projectId}`;
    return {
        overview: `${base}/overview`,
        exportData: `${base}/export`,
        sales: `${base}/sales`,
        kanoAnalysis: `${base}/kano/analysis`,
        qfdAnalysis: `${base}/qfd/analysis`,
        improvements: `${base}/improvements`,
        techTree: `${base}/tech-tree`,
        targetSpec: `${base}/target-spec`,
        techRoadmap: `${base}/tech-roadmap`,
        assets: `${base}/assets`,
        funding: `${base}/funding`,
        mentors: `${base}/mentors`,
    };
}

export type WorksheetRouteKey = keyof ReturnType<typeof buildRouteUrls>;

/** 화면이 "n/12" 로 진행을 보여 줄 때 쓰는 분모. 라우트를 늘리면 같이 늘어난다. */
export const WORKSHEET_ROUTE_COUNT = Object.keys(buildRouteUrls('')).length;

async function fetchJsonOrNull(url: string): Promise<unknown> {
    // 타임아웃이 없으면 라우트 하나가 응답하지 않을 때 화면이 영영 로딩 상태로 남는다.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        // 코치명 라우트는 권한이 없으면 403 이다. 그것 하나 때문에 보고서 생성이
        // 막히면 안 되므로 실패는 전부 빈 값으로 떨어뜨린다.
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export interface WorksheetPayloadsState {
    payloads: Record<string, unknown> | null;
    isLoading: boolean;
    /** 어디까지 받았는지. 열두 곳을 한꺼번에 부르므로 멈춘 것과 느린 것을 구별해야 한다. */
    loadedCount: number;
    /** 못 받은 곳. 조용히 null 로 넘기면 표가 왜 비었는지 알 수 없다. */
    failedKeys: string[];
}

export function useWorksheetPayloads(projectId: string): WorksheetPayloadsState {
    const [payloads, setPayloads] = useState<Record<string, unknown> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadedCount, setLoadedCount] = useState(0);
    const [failedKeys, setFailedKeys] = useState<string[]>([]);

    useEffect(() => {
        const urls = buildRouteUrls(projectId);
        const keys = Object.keys(urls) as WorksheetRouteKey[];
        (async () => {
            const results: unknown[] = [];
            for (let start = 0; start < keys.length; start += BATCH_SIZE) {
                const batch = keys.slice(start, start + BATCH_SIZE);
                const done = await Promise.all(batch.map((key) => fetchJsonOrNull(urls[key]).then((result) => {
                    setLoadedCount((count) => count + 1);
                    return result;
                })));
                results.push(...done);
            }
            setPayloads(Object.fromEntries(keys.map((key, index) => [key, results[index]])));
            setFailedKeys(keys.filter((_, index) => results[index] === null));
        })().finally(() => setIsLoading(false));
    }, [projectId]);

    return { payloads, isLoading, loadedCount, failedKeys };
}
