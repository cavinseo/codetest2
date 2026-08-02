// 현재 SQLite 데이터베이스의 전체 행을 JSON 파일로 덤프하는 1회성 마이그레이션 스크립트입니다.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { MIGRATION_MODEL_ORDER } from './db-migration-models.mjs';

const OUT_PATH = path.join(process.cwd(), 'prisma', 'backup', 'sqlite-export.json');

async function main() {
    const prisma = new PrismaClient();
    const dump = {};
    let total = 0;

    try {
        // 읽기만 하므로 순서는 무관하지만, 적재 스크립트와 목록을 공유해 누락을 막는다.
        for (const model of MIGRATION_MODEL_ORDER) {
            const rows = await prisma[model].findMany();
            dump[model] = rows;
            total += rows.length;
            console.log(`${model.padEnd(28)} ${String(rows.length).padStart(6)}`);
        }
    } finally {
        await prisma.$disconnect();
    }

    await mkdir(path.dirname(OUT_PATH), { recursive: true });
    await writeFile(OUT_PATH, JSON.stringify(dump, null, 2), 'utf8');
    console.log(`\n총 ${total}행을 ${OUT_PATH} 에 저장했습니다.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
