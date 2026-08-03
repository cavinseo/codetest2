// Supabase의 public 스키마 테이블은 기본적으로 PostgREST를 통해 외부에 노출된다.
// 이 앱은 Prisma로만 접근하므로, 정책 없는 RLS를 켜 REST API 경로를 기본 차단한다.
import { PrismaClient } from '@prisma/client';
import { MIGRATION_MODEL_ORDER } from './db-migration-models.mjs';

const TABLE_NAMES = {
    user: 'users', project: 'projects', projectMember: 'project_members',
    customerRequirement: 'customer_requirements', technicalCharacteristic: 'technical_characteristics',
    productAttribute: 'product_attributes', specFunction: 'spec_functions',
    kanoSurveyInvitation: 'kano_survey_invitations', kanoResponse: 'kano_responses',
    qFDMatrix: 'qfd_matrices', techCorrelation: 'tech_correlations', benchmark: 'benchmarks',
    attributeFitness: 'attribute_fitnesses', fitnessMatrix: 'fitness_matrices',
    migrationHistory: 'migration_histories', techTreeEntry: 'tech_tree_entries',
    improvementItem: 'improvement_items', targetSpec: 'target_specs', techRoadmap: 'tech_roadmaps',
    devPlan: 'dev_plans', salesEstimate: 'sales_estimates', assetItem: 'asset_items',
    fundingPlan: 'funding_plans', fundingSource: 'funding_sources',
};

async function main() {
    const prisma = new PrismaClient();
    try {
        for (const model of MIGRATION_MODEL_ORDER) {
            const table = TABLE_NAMES[model];
            await prisma.$executeRawUnsafe(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`);
            console.log(`RLS 활성화: ${table}`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
