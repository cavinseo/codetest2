// 이력 FK 가 실제로 SetNull 로 바뀌었는지 DB 에서 직접 확인하는 읽기 전용 스크립트입니다.
//
// `prisma migrate status` 는 _prisma_migrations 기록만 본다. 기록이 있어도 실제 SQL 이
// 돌지 않았을 수 있고, 그 경우 멘티 삭제가 마지막 user.delete 에서 P2003 으로 실패한다.
// 관리자가 사유까지 고르고 확정을 누른 뒤에 실패하는 것이라 미리 확인해야 한다.
//
//   node scripts/check-history-fk.mjs      또는      npm run check:history-fk
//
// SELECT 만 한다. 앱이 쓰는 접속 문자열을 그대로 쓰므로 "그 DB" 의 상태를 본다 —
// 대시보드에서 다른 프로젝트를 열어 볼 위험이 없다.
import { PrismaClient } from '@prisma/client';
import { describeDatabase, loadEnvFileIfPresent } from './admin-recovery.mjs';

const MIGRATION_NAME = '20260902000000_anonymize_deleted_user_history';

// 이 둘이 NULL 을 못 받으면 활동한 멘티를 지울 수 없다.
const TARGETS = [
    { table: 'kano_survey_invitations', column: 'invitedBy', label: '설문 초대 발송자' },
    { table: 'migration_histories', column: 'userId', label: '엑셀 가져온 사람' },
];

function findRow(rows, table, column) {
    return rows.find((row) => row.table_name === table && row.column_name === column);
}

async function main() {
    loadEnvFileIfPresent();

    console.log('');
    console.log('  대상 DB : ' + describeDatabase(process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL));
    console.log('');

    const prisma = new PrismaClient();
    try {
        const columns = await prisma.$queryRaw`
            SELECT table_name, column_name, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name IN ('kano_survey_invitations', 'migration_histories')
              AND column_name IN ('invitedBy', 'userId')
        `;

        const rules = await prisma.$queryRaw`
            SELECT tc.table_name, kcu.column_name, rc.delete_rule
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON kcu.constraint_schema = tc.constraint_schema
             AND kcu.constraint_name = tc.constraint_name
            JOIN information_schema.referential_constraints rc
              ON rc.constraint_schema = tc.constraint_schema
             AND rc.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public'
              AND tc.table_name IN ('kano_survey_invitations', 'migration_histories')
              AND kcu.column_name IN ('invitedBy', 'userId')
        `;

        let allGood = true;
        for (const target of TARGETS) {
            const column = findRow(columns, target.table, target.column);
            const rule = findRow(rules, target.table, target.column);
            const nullable = column?.is_nullable === 'YES';
            const setNull = rule?.delete_rule === 'SET NULL';
            const ok = nullable && setNull;
            if (!ok) allGood = false;

            console.log(`  ${ok ? '[정상]' : '[미적용]'} ${target.table}.${target.column} (${target.label})`);
            console.log(`      NULL 허용  : ${column?.is_nullable ?? '(컬럼을 찾지 못함)'}`);
            console.log(`      삭제 규칙  : ${rule?.delete_rule ?? '(FK 를 찾지 못함)'}`);
        }

        // 기록과 실제가 어긋나 있는지, 어긋났다면 언제 기록됐는지까지 본다.
        const recorded = await prisma.$queryRaw`
            SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
            FROM _prisma_migrations
            WHERE migration_name = ${MIGRATION_NAME}
        `;

        console.log('');
        if (recorded.length === 0) {
            console.log('  마이그레이션 기록 : 없음');
        } else {
            for (const row of recorded) {
                console.log('  마이그레이션 기록 : ' + row.migration_name);
                console.log(`      적용 완료 : ${row.finished_at ?? '(미완료)'}`);
                console.log(`      되돌림    : ${row.rolled_back_at ?? '없음'}`);
                console.log(`      실행 단계 : ${row.applied_steps_count}`);
            }
        }

        console.log('');
        if (allGood) {
            console.log('  결론: 적용됐다. 멘티 삭제 구현(Task 2)으로 넘어가도 된다.');
        } else {
            console.log('  결론: 아직 적용되지 않았다. 기록을 되돌리고 다시 적용해야 한다.');
            console.log('');
            console.log(`    npx prisma migrate resolve --rolled-back ${MIGRATION_NAME}`);
            console.log('    npx prisma migrate deploy');
            console.log('    node scripts/check-history-fk.mjs');
        }
        console.log('');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('확인에 실패했습니다.');
    console.error(error?.message ?? error);
    process.exitCode = 1;
});
