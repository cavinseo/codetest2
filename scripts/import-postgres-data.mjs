// 덤프 JSON 을 PostgreSQL 호환 대상에 FK 순서대로 적재하고 행 수를 대조하는 1회성 마이그레이션 스크립트입니다.
// 기본 입력은 prisma/backup/sqlite-export.json 이며, 인자로 다른 덤프 파일 경로를 지정할 수 있다.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { MIGRATION_MODEL_ORDER, chunk } from './db-migration-models.mjs';

const IN_PATH = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(process.cwd(), 'prisma', 'backup', 'sqlite-export.json');
const BATCH_SIZE = 500;

async function main() {
    console.log(`입력 파일: ${IN_PATH}\n`);
    const dump = JSON.parse(await readFile(IN_PATH, 'utf8'));
    const prisma = new PrismaClient();
    const mismatches = [];

    try {
        for (const model of MIGRATION_MODEL_ORDER) {
            const rows = dump[model] ?? [];

            for (const batch of chunk(rows, BATCH_SIZE)) {
                await prisma[model].createMany({ data: batch });
            }

            const actual = await prisma[model].count();
            const status = actual === rows.length ? 'OK' : 'MISMATCH';
            if (status === 'MISMATCH') {
                mismatches.push(`${model}: 기대 ${rows.length}, 실제 ${actual}`);
            }
            console.log(`${model.padEnd(28)} ${String(rows.length).padStart(6)} -> ${String(actual).padStart(6)}  ${status}`);
        }
    } finally {
        await prisma.$disconnect();
    }

    if (mismatches.length > 0) {
        console.error('\n행 수가 일치하지 않습니다:');
        for (const line of mismatches) console.error(`  - ${line}`);
        process.exitCode = 1;
        return;
    }

    console.log('\n모든 모델의 행 수가 원본과 일치합니다.');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
