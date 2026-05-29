import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const projects = await prisma.project.findMany({
        include: {
            _count: {
                select: {
                    requirements: true,
                    kanoResponses: true,
                    qfdMatrices: true,
                    specFunctions: true,
                    improvementItems: true,
                    targetSpecs: true
                }
            }
        }
    });

    console.log('--- Project Data Summary ---');
    projects.forEach(p => {
        console.log(`Project: ${p.name} (${p.id})`);
        console.log(`- Requirements: ${p._count.requirements}`);
        console.log(`- Kano Responses: ${p._count.kanoResponses}`);
        console.log(`- QFD Matrix Cells: ${p._count.qfdMatrices}`);
        console.log(`- Improvements: ${p._count.improvementItems}`);
        console.log(`- Target Specs: ${p._count.targetSpecs}`);
        console.log('---------------------------');
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
