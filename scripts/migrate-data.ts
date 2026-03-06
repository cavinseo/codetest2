import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const DB_FILE = path.join(process.cwd(), 'data', 'db.json');

const KANO_ANSWER_MAP: Record<string, number> = {
    LIKE: 1,
    EXPECT: 2,
    NEUTRAL: 3,
    TOLERATE: 4,
    DISLIKE: 5,
};

async function main() {
    if (!fs.existsSync(DB_FILE)) {
        console.log('JSON DB 파일이 존재하지 않습니다. 마이그레이션을 스킵합니다.');
        return;
    }

    const rawData = fs.readFileSync(DB_FILE, 'utf-8');
    const db = JSON.parse(rawData);

    console.log('데이터 마이그레이션 시작...');

    // 1. Users
    if (db.users) {
        for (const user of db.users) {
            await prisma.user.upsert({
                where: { email: user.email },
                update: {},
                create: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    passwordHash: user.passwordHash,
                    createdAt: new Date(user.createdAt),
                    updatedAt: new Date(user.updatedAt),
                },
            });
        }
        console.log(`Users 마이그레이션 완료: ${db.users.length}개`);
    }

    // 2. Projects
    if (db.projects) {
        for (const project of db.projects) {
            await prisma.project.upsert({
                where: { id: project.id },
                update: {},
                create: {
                    id: project.id,
                    name: project.name,
                    description: project.description,
                    detailedDescription: project.detailedDescription,
                    businessPlanFile: project.businessPlanFile,
                    ownerId: project.ownerId,
                    createdAt: new Date(project.createdAt),
                    updatedAt: new Date(project.updatedAt),
                },
            });
        }
        console.log(`Projects 마이그레이션 완료: ${db.projects.length}개`);
    }

    // 3. ProjectMembers
    if (db.projectMembers) {
        for (const member of db.projectMembers) {
            await prisma.projectMember.create({
                data: {
                    id: member.id,
                    projectId: member.projectId,
                    userId: member.userId,
                    role: member.role,
                    invitedBy: member.invitedBy,
                    invitedAt: new Date(member.invitedAt),
                    joinedAt: member.joinedAt ? new Date(member.joinedAt) : null,
                },
            });
        }
        console.log(`ProjectMembers 마이그레이션 완료: ${db.projectMembers.length}개`);
    }

    // 4. SpecFunctions
    if (db.specFunctions) {
        for (const sf of db.specFunctions) {
            await prisma.specFunction.create({
                data: {
                    id: sf.id,
                    projectId: sf.projectId,
                    level: sf.level,
                    parentId: sf.parentId,
                    name: sf.name,
                    technology: sf.technology,
                    order: sf.order,
                },
            });
        }
        console.log(`SpecFunctions 마이그레이션 완료: ${db.specFunctions.length}개`);
    }

    // 5. CustomerRequirements
    if (db.customerRequirements) {
        for (const req of db.customerRequirements) {
            await prisma.customerRequirement.create({
                data: {
                    id: req.id,
                    projectId: req.projectId,
                    category: req.category,
                    subcategory: req.subcategory,
                    requirement: req.requirement,
                    order: req.order,
                },
            });
        }
        console.log(`CustomerRequirements 마이그레이션 완료: ${db.customerRequirements.length}개`);
    }

    // 6. TechnicalCharacteristics
    if (db.technicalCharacteristics) {
        for (const tc of db.technicalCharacteristics) {
            await prisma.technicalCharacteristic.create({
                data: {
                    id: tc.id,
                    projectId: tc.projectId,
                    name: tc.name,
                    unit: tc.unit,
                    targetValue: tc.targetValue,
                },
            });
        }
        console.log(`TechnicalCharacteristics 마이그레이션 완료: ${db.technicalCharacteristics.length}개`);
    }

    // 7. KanoSurveyInvitations
    if (db.kanoInvitations) {
        for (const inv of db.kanoInvitations) {
            await prisma.kanoSurveyInvitation.create({
                data: {
                    id: inv.id,
                    projectId: inv.projectId,
                    email: inv.email,
                    token: inv.token,
                    invitedBy: db.projects.find((p: any) => p.id === inv.projectId)?.ownerId || '', // 초대자를 프로젝트 소유자로 가정
                    expiresAt: new Date(inv.expiresAt),
                    respondedAt: inv.respondedAt ? new Date(inv.respondedAt) : null,
                    isUsed: !!inv.respondedAt,
                },
            });
        }
        console.log(`KanoSurveyInvitations 마이그레이션 완료: ${db.kanoInvitations.length}개`);
    }

    // 8. KanoResponses
    if (db.kanoResponses) {
        for (const res of db.kanoResponses) {
            const invitation = db.kanoInvitations.find((i: any) => i.id === res.invitationId);
            await prisma.kanoResponse.create({
                data: {
                    id: res.id,
                    projectId: res.projectId,
                    requirementId: res.requirementId,
                    invitationId: res.invitationId,
                    respondentEmail: invitation?.email || 'unknown',
                    positiveAnswer: KANO_ANSWER_MAP[res.functionalAnswer] || 3,
                    negativeAnswer: KANO_ANSWER_MAP[res.dysfunctionalAnswer] || 3,
                    kanoCategory: res.category,
                    respondedAt: new Date(res.respondedAt),
                },
            });
        }
        console.log(`KanoResponses 마이그레이션 완료: ${db.kanoResponses.length}개`);
    }

    // 9. QFDMatrix
    if (db.qfdRelationships) {
        for (const rel of db.qfdRelationships) {
            await prisma.qFDMatrix.create({
                data: {
                    id: rel.id,
                    projectId: rel.projectId,
                    requirementId: rel.requirementId,
                    technicalCharId: rel.technicalCharId,
                    relationship: rel.strength,
                },
            });
        }
        console.log(`QFDRelationships 마이그레이션 완료: ${db.qfdRelationships.length}개`);
    }

    // 10. ProductAttributes
    if (db.productAttributes) {
        for (const pa of db.productAttributes) {
            await prisma.productAttribute.create({
                data: {
                    id: pa.id,
                    projectId: pa.projectId,
                    productName: pa.productName,
                    customerName: pa.customerName,
                    marketSegment: pa.marketSegment,
                    customerNeed: pa.customerNeed,
                    benefit: pa.benefit,
                    attribute: pa.attribute,
                    techCapability: pa.techCapability,
                    order: pa.order,
                },
            });
        }
        console.log(`ProductAttributes 마이그레이션 완료: ${db.productAttributes.length}개`);
    }

    // 11. AttributeFitnesses
    if (db.attributeFitnesses) {
        for (const af of db.attributeFitnesses) {
            await prisma.attributeFitness.create({
                data: {
                    id: af.id,
                    projectId: af.projectId,
                    attributeId: af.attributeId,
                    importance: af.importance,
                    currentLevel: af.currentLevel,
                    targetLevel: af.targetLevel,
                    note: af.note,
                },
            });
        }
        console.log(`AttributeFitnesses 마이그레이션 완료: ${db.attributeFitnesses.length}개`);
    }

    // 12. TechCorrelations
    if (db.techCorrelations) {
        for (const tc of db.techCorrelations) {
            await prisma.techCorrelation.create({
                data: {
                    id: tc.id,
                    projectId: tc.projectId,
                    techId1: tc.techId1,
                    techId2: tc.techId2,
                    correlation: tc.correlation,
                },
            });
        }
        console.log(`TechCorrelations 마이그레이션 완료: ${db.techCorrelations.length}개`);
    }

    // 13. Benchmarks
    if (db.benchmarks) {
        for (const bm of db.benchmarks) {
            await prisma.benchmark.create({
                data: {
                    id: bm.id,
                    projectId: bm.projectId,
                    requirementId: bm.requirementId,
                    company: bm.company,
                    score: bm.score,
                },
            });
        }
        console.log(`Benchmarks 마이그레이션 완료: ${db.benchmarks.length}개`);
    }

    console.log('마이그레이션 성공적으로 완료되었습니다.');
}

main()
    .catch((e) => {
        console.error('마이그레이션 오류:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
