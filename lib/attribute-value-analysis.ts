// WS-3 입력을 근거로 가치사슬·가치시스템의 규칙 기반 검토 초안을 만든다.
import type { ValueAnalysisInput, ValueAnalysisResult } from './ai/types';

export function generateValueAnalysis(input: ValueAnalysisInput): ValueAnalysisResult {
    const product = input.productName?.trim() || input.project.name;
    const rows = input.existingRows ?? [];
    const summarize = (values: Array<string | null | undefined>, fallback: string) =>
        Array.from(new Set(values.map(value => value?.trim()).filter(Boolean))).slice(0, 8).join(' / ') || fallback;
    const customers = summarize([input.answers.customerNames, ...rows.map(row => row.customerName)], '고객 역할 확인 필요');
    const segments = summarize([input.answers.marketSegments, ...rows.map(row => row.marketSegment)], '세분시장 확인 필요');
    const needs = summarize([input.answers.customerProblems, ...rows.map(row => row.customerNeed)], '고객 니즈 확인 필요');
    const benefits = summarize([input.answers.expectedBenefits, ...rows.map(row => row.benefit)], '제공혜택 확인 필요');
    const functions = summarize([...rows.map(row => row.attribute), ...(input.specFunctions ?? []).map(spec => spec.name)], '주요 기능 확인 필요');
    const technologies = summarize([...rows.map(row => row.techCapability), ...(input.specFunctions ?? []).map(spec => spec.technology)], '보유 기술 확인 필요');

    return {
        summary: `${product}의 입력 정보를 활동·참여자별로 연결한 기본 분석 초안입니다. 실제 운영과 거래관계는 확인이 필요합니다.`,
        valueChain: [
            { activity: '투입물류', category: 'primary', analysis: `${product} 제공에 필요한 자재·데이터·서비스의 입수 경로는 확인 필요.`, opportunity: '핵심 투입물의 품질 기준, 공급 지연, 대체 가능성을 점검합니다.' },
            { activity: '생산·서비스 운영', category: 'primary', analysis: `입력된 기능: ${functions}. 해결할 니즈: ${needs}.`, opportunity: '기능별 작업 흐름에서 대기·재작업·오류가 발생하는 단계를 찾습니다.' },
            { activity: '산출물류·전달', category: 'primary', analysis: `대상 고객: ${customers}. 제품·서비스 전달 방식은 확인 필요.`, opportunity: '납품·설치·접속·온보딩 중 해당하는 전달 단계의 지연과 누락을 점검합니다.' },
            { activity: '마케팅·판매', category: 'primary', analysis: `세분시장: ${segments}. 제안할 혜택: ${benefits}.`, opportunity: '구매 결정자와 실제 사용자를 구분하고, 혜택을 검증할 구매 기준을 확인합니다.' },
            { activity: '사용 지원·서비스', category: 'primary', analysis: `고객이 겪는 문제: ${needs}. 사용 후에도 해결되는지 검증 필요.`, opportunity: '고객 피드백을 수집하고 사용 전후의 개선 효과를 비교합니다.' },
            { activity: '조달', category: 'support', analysis: `${product}의 외부 구매 항목과 계약 조건은 확인 필요.`, opportunity: '가격뿐 아니라 품질·공급 지속성·전환 비용을 비교합니다.' },
            { activity: '기술개발', category: 'support', analysis: `입력된 기술: ${technologies}.`, opportunity: '고객 니즈와 기술을 연결하고 내부 개발·외부 협력의 범위를 정합니다.' },
            { activity: '인적자원', category: 'support', analysis: `주요 기능(${functions})의 개발·운영 담당 역량은 확인 필요.`, opportunity: '핵심 업무 담당자와 교육·채용·파트너 지원이 필요한 역량을 확인합니다.' },
            { activity: '기업 인프라', category: 'support', analysis: `${product}의 품질·비용·일정 관리 체계는 확인 필요.`, opportunity: '고객 혜택을 측정할 지표와 의사결정 책임자를 정합니다.' },
        ],
        valueSystem: [
            { actor: '투입물 공급자', position: 'upstream', valueFlow: `가정: 공급자 → 자사에 ${product}에 필요한 자재·데이터·서비스 제공, 자사 → 공급자에 대금·규격 전달.`, opportunity: '실제 공급자를 확인하고 공급 중단·품질 위험과 대체 방안을 비교합니다.' },
            { actor: `${product} 제공 기업`, position: 'company', valueFlow: `자사가 결합할 기능: ${functions}. 고객에게 제공할 가치: ${benefits}.`, opportunity: `차별화할 핵심 활동이 ${needs} 해결에 기여하는지 검증합니다.` },
            { actor: '유통·전달 채널', position: 'downstream', valueFlow: '가정: 자사 → 채널 → 고객으로 제품·서비스와 사용 정보를 전달하고, 고객 → 채널 → 자사로 주문·피드백·대금이 돌아옵니다. 직접 판매 여부는 확인 필요.', opportunity: '직접 전달과 중개 채널의 고객 접근성·수수료·지원 책임을 비교합니다.' },
            { actor: customers, position: 'customer', valueFlow: `고객이 얻는 가치: ${benefits}. 고객 → 자사로 요구사항·사용 피드백을 전달합니다. 실제 지불 주체는 확인 필요.`, opportunity: `세분시장(${segments})별로 니즈(${needs})의 중요도와 지불 의향을 확인합니다.` },
            { actor: '보완재·협력 파트너', position: 'partner', valueFlow: `가정: 제품(${product})과 함께 사용하는 제품·서비스의 제공자와 기술·정보·고객 접점을 연계할 수 있습니다.`, opportunity: '필수 보완재, 연동 조건, 데이터 소유권과 수익 배분 조건을 확인합니다.' },
        ],
        assumptions: [
            '기본 엔진은 입력 내용을 분류한 검토 초안을 제공합니다. 운영 현황이나 거래관계를 조사한 결과가 아닙니다.',
            '공급자·유통 채널·보완재 참여자는 역할 가정이며, 실제 업체와 존재 여부를 확인해야 합니다.',
            '비용·납기·불량률·성과 수치는 제공되지 않아 정량 평가하지 않았습니다.',
        ],
        nextActions: [
            `고객(${customers})에게 니즈(${needs})의 우선순위와 혜택(${benefits})의 확인 방법을 질문합니다.`,
            `${product}의 투입부터 고객 사용까지 실제 활동·담당자·소요 시간·비용을 기록합니다.`,
            '공급자·자사·채널·고객 간 물자·정보·대금 흐름을 확인하고 가장 큰 병목부터 개선합니다.',
        ],
    };
}
