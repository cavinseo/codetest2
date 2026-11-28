// 보고서 재생성 시 워크시트 표와 집계의 행 순서를 WS-5 기준으로 통일한다.
import type { FinalReportWorksheetData } from './final-report-document';
import { groupRequirementsByCategory } from './requirements-table-utils';
import { orderByRequirementIds, orderByRequirementText, orderTargetSpecs } from './requirement-order';

export function orderReportWorksheetData(data: FinalReportWorksheetData): FinalReportWorksheetData {
    const requirements = groupRequirementsByCategory(data.requirements.map((row, order) => ({ ...row, order })));
    const techTree = orderByRequirementText(data.techTree.map((row, order) => ({ ...row, order })), requirements, row => row.customerVoice);
    return { ...data, requirements, techTree,
        kanoAggregation: orderByRequirementIds(data.kanoAggregation, requirements, row => row.requirementId),
        competitiveAssessment: orderByRequirementIds(data.competitiveAssessment, requirements, row => row.requirementId),
        improvementNeeds: orderByRequirementText(data.improvementNeeds.map((row, order) => ({ ...row, order })), requirements, row => row.content),
        improvementFeatures: orderByRequirementText(data.improvementFeatures.map((row, order) => ({ ...row, order })), requirements, row => row.content),
        improvementDirections: orderByRequirementText(data.improvementDirections.map((row, order) => ({ ...row, order })), requirements, row => row.category),
        targetSpecs: orderTargetSpecs(data.targetSpecs.map((row, order) => ({ ...row, order })), techTree),
    };
}
