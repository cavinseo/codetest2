import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function run() {
    try {
        console.log('Finding a project with Kano survey and questions...');
        
        // Find practically the latest project with Kano questions
        const surveys = await prisma.kanoSurvey.findMany({
            include: { 
                project: { 
                    include: { kanoQuestions: true } 
                } 
            },
            orderBy: { createdAt: 'desc' }
        });
        
        const survey = surveys.find(s => s.project.kanoQuestions.length > 0);
        
        if (!survey) {
            console.log('No surveys with Kano questions found in database.');
            return;
        }

        const projectId = survey.projectId;
        const surveyId = survey.id;
        const questions = survey.project.kanoQuestions;
        
        console.log(`Target Project: ${projectId}`);
        console.log(`Target Survey: ${surveyId}`);
        console.log(`Questions found: ${questions.length}`);
        
        console.log('Generating 30 random responses...');
        
        let successCount = 0;
        
        for (let i = 0; i < 30; i++) {
            const email = `test_random_${i + 1}_${Math.floor(Math.random() * 1000)}@example.com`;
            
            // Kano Responses are mapped 1: Like, 2: Must-be, 3: Neutral, 4: Live with, 5: Dislike
            const responseData = questions.map((q, idx) => {
                return {
                    questionId: q.id,
                    seq: idx + 1,
                    positiveAnswer: Math.floor(Math.random() * 5) + 1,
                    negativeAnswer: Math.floor(Math.random() * 5) + 1,
                };
            });
            
            const responsesStr = JSON.stringify(responseData);
            
            // Using raw SQL because the schema models `positiveAnswer` in JSON but we had mismatch issues before or Prisma schema has strict models
            await prisma.$executeRaw`
                INSERT INTO "KanoResponse" (
                    "id", "surveyId", "projectId", "respondentEmail", 
                    "responses", "createdAt", "updatedAt"
                ) VALUES (
                    ${randomUUID()}, ${surveyId}, ${projectId}, ${email},
                    ${responsesStr}::jsonb, NOW(), NOW()
                )
            `;
            
            successCount++;
        }
        
        console.log(`✅ Successfully generated ${successCount} random test responses.`);
        console.log(`Test complete. Please check the 'Kano 관리 > 분석' dashboard.`);
    } catch(e) {
        console.error('Error seeding data:', e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
