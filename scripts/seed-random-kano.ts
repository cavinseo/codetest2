import { prisma } from '../lib/prisma';
import { classifyKanoResponse, KanoAnswer } from '../lib/kano-algorithm';
import { randomUUID } from 'crypto';

async function seedRandomKano() {
    try {
        console.log('🚀 Kano 랜덤 데이터 시딩을 시작합니다...');

        // 1. 요구사항이 하나라도 있는 가장 최근 프로젝트 찾기
        const latestProject = await prisma.project.findFirst({
            where: {
                requirements: {
                    some: {}
                }
            },
            orderBy: { createdAt: 'desc' },
            include: { requirements: true }
        });

        if (!latestProject) {
            console.error('❌ 프로젝트를 찾을 수 없습니다.');
            return;
        }

        if (latestProject.requirements.length === 0) {
            console.error(`❌ 프로젝트 "${latestProject.name}"에 등록된 요구사항이 없습니다.`);
            return;
        }

        console.log(`📌 대상 프로젝트: ${latestProject.name} (ID: ${latestProject.id})`);
        console.log(`📌 요구사항 수: ${latestProject.requirements.length}개`);

        // 2. 기존 데이터 삭제 (해당 프로젝트의 응답 및 초대)
        console.log('🧹 기존 응답 및 초대 데이터를 삭제 중...');
        await prisma.kanoResponse.deleteMany({ where: { projectId: latestProject.id } });
        await prisma.kanoSurveyInvitation.deleteMany({ where: { projectId: latestProject.id } });
        console.log('✅ 기존 데이터 삭제 완료.');

        // 3. 초대자(관리자 등) 한 명 찾기
        const adminUser = await prisma.user.findFirst();
        if (!adminUser) {
            console.error('❌ 사용자를 찾을 수 없습니다.');
            return;
        }

        const RESPONDENT_COUNT = 30;
        console.log(`📝 ${RESPONDENT_COUNT}명의 균형 잡힌 응답 데이터를 생성 중...`);

        let responseCount = 0;

        for (let i = 0; i < RESPONDENT_COUNT; i++) {
            const respondentEmail = `final_test_${i + 1}_${Math.floor(Math.random() * 1000)}@example.com`;
            const token = randomUUID();

            // 4. 설문 초대 생성
            const invitation = await prisma.kanoSurveyInvitation.create({
                data: {
                    projectId: latestProject.id,
                    email: respondentEmail,
                    token: token,
                    invitedBy: adminUser.id,
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    isUsed: true,
                    respondedAt: new Date(),
                }
            });

            // 5. 각 요구사항별 응답 생성 (A, O, M, I 균등 배분)
            for (let j = 0; j < latestProject.requirements.length; j++) {
                const req = latestProject.requirements[j];
                
                // i(응답자 인덱스)와 j(문항 인덱스)를 조합하여 4가지 품질이 골고루 섞이게 함
                const mode = (i + j) % 4; 
                let pos: KanoAnswer, neg: KanoAnswer;

                switch (mode) {
                    case 0: // Attractive (A): 좋다 / 무관심
                        pos = 1; neg = 3; break;
                    case 1: // One-dimensional (O): 좋다 / 싫다
                        pos = 1; neg = 5; break;
                    case 2: // Must-be (M): 무관심 / 싫다
                        pos = 3; neg = 5; break;
                    case 3: // Indifferent (I): 무관심 / 무관심
                        pos = 3; neg = 3; break;
                    default:
                        pos = 3; neg = 3;
                }

                const category = classifyKanoResponse(pos, neg);

                await prisma.kanoResponse.create({
                    data: {
                        projectId: latestProject.id,
                        requirementId: req.id,
                        invitationId: invitation.id,
                        respondentEmail: respondentEmail,
                        positiveAnswer: pos,
                        negativeAnswer: neg,
                        kanoCategory: category,
                        respondedAt: new Date(),
                    }
                });
                responseCount++;
            }
        }

        console.log(`✅ 성공적으로 ${RESPONDENT_COUNT}명의 응답(${responseCount}건의 상세 레코드)을 생성했습니다.`);
        console.log('✨ 이제 서비스의 [분석] 탭에서 확인해 보세요!');

    } catch (error) {
        console.error('❌ 시딩 중 오류 발생:', error);
    } finally {
        await prisma.$disconnect();
    }
}

seedRandomKano();
