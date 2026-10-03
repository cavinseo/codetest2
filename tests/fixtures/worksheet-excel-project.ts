// 전체 워크시트의 저장 항목과 계산 검증에 사용할 프로젝트 예시를 만든다.
import type { WorksheetExcelProject } from '../../lib/worksheet-excel';

export function worksheetExcelProject(): WorksheetExcelProject {
    const common = { projectId: 'project-1', order: 0, createdAt: new Date('2026-10-03') };
    return {
        id: 'project-1', name: '시험 프로젝트', description: '제품 개발', specDetailCollapsed: false,
        companyName: null, ownerId: 'owner', programId: 'program', createdAt: common.createdAt, updatedAt: common.createdAt,
        businessPlanFile: null, detailedDescription: null, productName: null, relatedImages: null, productImageDataUrl: null,
        productImageWidthPx: null, productImageHeightPx: null, marketDefinition: null, targetCustomer: null, aiMode: 'rule', qfdTechnicalInitialized: true,
        kanoSurveyIntroduction: { technology: '자동화', productType: '분리판', companyName: '시험회사', representativeName: '홍길동', offering: '가공 솔루션' },
        specFunctions: [
            { ...common, id: 'core', level: 'CORE', parentId: null, name: '가공', technology: null },
            { ...common, id: 'sub', order: 1, level: 'SUB', parentId: 'core', name: '이송', technology: '공압 이송' },
            { ...common, id: 'detail', order: 2, level: 'DETAIL', parentId: 'sub', name: '판재 위치', technology: '센서' },
        ],
        productAttributes: [{ ...common, id: 'attribute', productName: '제품', customerName: '고객', marketSegment: '시장', customerNeed: '정밀도', benefit: '불량 감소', attribute: '정확성', techCapability: '제어' }],
        attributeFitnesses: [],
        fitnessMatrix: { id: 'fitness', projectId: 'project-1', marketsJson: JSON.stringify([{ id: 'market', name: '제조업', subSegments: [{ id: 'customer', name: '가공업체' }] }]), matrixJson: JSON.stringify({ attribute: { market: { customer: 'L*' } } }), managerComment: '검토 의견', consultantNote: '컨설턴트 의견', updatedAt: new Date('2026-10-03') },
        requirements: [
            { ...common, id: 'requirement', category: '품질', subcategory: '정밀도', requirement: '정확하게 가공', kanoPositiveQ: '가공이 정확하면?', kanoNegativeQ: '가공이 부정확하면?', kanoWeight: 1.73 },
            { ...common, id: 'empty-requirement', order: 1, category: '품질', subcategory: '속도', requirement: '=수식이 아닌 고객 의견', kanoPositiveQ: null, kanoNegativeQ: null, kanoWeight: null },
        ],
        technicalCharacteristics: [{ id: 'technical', projectId: 'project-1', name: '위치 제어', unit: 'mm', targetValue: '0.05', groupIndex: 0, columnOrder: 0 }],
        qfdMatrices: [{ id: 'qfd', projectId: 'project-1', requirementId: 'requirement', technicalCharId: 'technical', strength: 'STRONG', currentScore: null, competitorScore: null }],
        kanoResponses: [{ id: 'response', projectId: 'project-1', requirementId: 'requirement', invitationId: 'invitation', respondentEmail: 'test@example.com', positiveAnswer: 1, negativeAnswer: 5, kanoCategory: 'O', respondedAt: new Date('2026-10-03T01:00:00Z') }],
        techCorrelations: [],
        benchmarks: [{ id: 'benchmark', projectId: 'project-1', requirementId: 'requirement', company: 'self', score: 3 }, { id: 'competitor', projectId: 'project-1', requirementId: 'requirement', company: '경쟁기업', score: 5 }],
        technicalBenchmarks: [{ id: 'tech-benchmark', projectId: 'project-1', technicalCharId: 'technical', company: 'self', value: '0.1' }],
        techTreeEntries: [{ ...common, id: 'tree', customerVoice: '정확하게 가공', coreSpec: '가공', subSpec: '자동 검사', techCharacteristic: 'AI 비전' }],
        improvementItems: [{ ...common, id: 'need', type: 'need', content: '불량 감소', improvementRate: '1.67', devProportion: '100%', priority: null }, { ...common, id: 'feature', order: 1, type: 'feature', content: '자동 검사', improvementRate: '검사 기능', devProportion: '오차 감소', priority: null }],
        targetSpecs: [
            { ...common, id: 'target-base', category: '가공', subCategory: '이송', specItem: '공압 이송', unit: 'mm', currentValue: '0.1', competitorValue: '0.08', targetValue: '0.05', note: '유지' },
            { ...common, id: 'target-detail', order: 1, category: '가공', subCategory: '이송', specItem: '센서', unit: null, currentValue: null, competitorValue: null, targetValue: null, note: '유지' },
            { ...common, id: 'target-new', order: 2, category: '가공', subCategory: '자동 검사', specItem: 'AI 비전', unit: '%', currentValue: '0', competitorValue: '95', targetValue: '99', note: '신규' },
        ],
        techRoadmaps: [{ ...common, id: 'roadmap', category: '자동화', techItem: '검사 기능', currentLevel: '구현 가능', targetLevel: '제조 기업', q1: '설계', q2: '개발', q3: '검증', q4: '양산', owner: '개발팀' }],
        devPlans: [{ ...common, id: 'plan', phase: '1단계', task: '개발 과제', description: '상세 내용', startDate: '2026-10-03', endDate: '2026-12-31', owner: '홍길동', status: '진행' }],
        salesEstimates: [{ ...common, id: 'sale', period: 'Y', customer: '고객', amount: 0, competitor: '경쟁사', futureAmount: 0 }, { ...common, id: 'future-sale', period: 'Y_PLUS_1', customer: '미래고객', amount: 1000, competitor: null, futureAmount: 0 }],
        assetItems: [{ ...common, id: 'asset', type: 'CORE', category: '기술', content: '핵심 기술' }, { ...common, id: 'complement', order: 1, type: 'COMPLEMENTARY', category: '설비', content: '임대' }],
        fundingPlans: [{ ...common, id: 'revenue', category: '매출액', item: '매출액', year1: 5, year2: null, year3: 0 }, { ...common, id: 'cost', order: 1, category: '소요자금', item: '생산비', year1: 100, year2: 200, year3: 0 }, { ...common, id: 'total', order: 2, category: '소요자금', item: '소요자금 합계', year1: 999, year2: 999, year3: 999 }],
        fundingSources: [{ ...common, id: 'source', category: '정부자금', year1: JSON.stringify({ source: '지원사업', amount: '1200' }), year2: '투자자:0', year3: null }],
    } as WorksheetExcelProject;
}
