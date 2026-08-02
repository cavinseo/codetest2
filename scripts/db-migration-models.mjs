// PostgreSQL 이관 시 FK 제약을 만족하는 모델 삽입 순서와 의존 관계를 정의합니다.

/** 각 모델이 FK 로 참조하는 부모 delegate 목록. 참조가 없는 모델은 생략한다. */
export const MODEL_DEPENDENCIES = {
    project: ['user'],
    projectMember: ['project', 'user'],
    customerRequirement: ['project'],
    technicalCharacteristic: ['project'],
    productAttribute: ['project'],
    specFunction: ['project'],
    kanoSurveyInvitation: ['project', 'user'],
    kanoResponse: ['project', 'customerRequirement', 'kanoSurveyInvitation'],
    qFDMatrix: ['project', 'customerRequirement', 'technicalCharacteristic'],
    techCorrelation: ['project', 'technicalCharacteristic'],
    benchmark: ['project', 'customerRequirement'],
    attributeFitness: ['project', 'productAttribute'],
    fitnessMatrix: ['project'],
    migrationHistory: ['project', 'user'],
    techTreeEntry: ['project'],
    improvementItem: ['project'],
    targetSpec: ['project'],
    techRoadmap: ['project'],
    devPlan: ['project'],
    salesEstimate: ['project'],
    assetItem: ['project'],
    fundingPlan: ['project'],
    fundingSource: ['project'],
};

/** 삽입 순서. 부모가 항상 자식보다 앞에 온다. */
export const MIGRATION_MODEL_ORDER = [
    'user',
    'project',
    'projectMember',
    'customerRequirement',
    'technicalCharacteristic',
    'productAttribute',
    'specFunction',
    'kanoSurveyInvitation',
    'kanoResponse',
    'qFDMatrix',
    'techCorrelation',
    'benchmark',
    'attributeFitness',
    'fitnessMatrix',
    'migrationHistory',
    'techTreeEntry',
    'improvementItem',
    'targetSpec',
    'techRoadmap',
    'devPlan',
    'salesEstimate',
    'assetItem',
    'fundingPlan',
    'fundingSource',
];

/** 배열을 size 개씩 잘라 2차원 배열로 만든다. */
export function chunk(items, size) {
    const result = [];
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }
    return result;
}
