// 관리자 계정을 잃었을 때 누가 관리자인지 찾아 보여주는 읽기 전용 스크립트입니다.
//
// 관리자 모드는 별도 계정이 아니라 일반 계정의 권한이다(role=ADMIN + isAdmin 또는
// ADMIN_EMAILS). 그래서 "관리자 계정을 잃었다"는 대개 "어느 계정이 관리자였는지
// 모른다"이거나 "권한 값 셋 중 하나가 어긋나 화면이 안 열린다"이다. 이 스크립트는
// 그 둘을 가려낸 뒤 다음에 칠 명령까지 알려 준다.
//
//   node scripts/find-admin.mjs      또는      npm run find:admin
//
// DB 에 아무것도 쓰지 않는다. 비밀번호를 새로 발급하는 것은 seed-admin.mjs 의 몫이다.
//
// 이메일은 가리지 않고 그대로 찍는다. 찾으려는 값이 바로 그 주소이고, 이 스크립트는
// 이미 DB 접속 문자열을 가진 운영자가 자기 터미널에서 돌리는 도구다. 앱 로그·응답에
// 이메일을 남기지 않는 규칙(lib/logger.ts)과는 대상이 다르다.
import { PrismaClient } from '@prisma/client';
import {
    describeDatabase,
    findMissingAdminEmails,
    parseAdminEmails,
    summarizeAdminCandidates,
} from './admin-recovery.mjs';

function formatCandidate(candidate) {
    const mark = candidate.canEnterAdminMode ? '[들어갈 수 있음]' : '[막힘]';
    const name = candidate.name ? ` ${candidate.name}` : '';
    const lines = [
        `  ${mark} ${candidate.email}${name}`,
        `      role=${candidate.role} isAdmin=${candidate.isAdmin} status=${candidate.status}` +
            (candidate.mustChangePassword ? ' 임시비밀번호' : ''),
    ];
    for (const blocker of candidate.blockers) {
        lines.push(`      - ${blocker}`);
    }
    return lines.join('\n');
}

async function main() {
    const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);

    console.log('');
    console.log('  대상 DB      : ' + describeDatabase(process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL));
    console.log('  ADMIN_EMAILS : ' + (adminEmails.length > 0 ? adminEmails.join(', ') : '(비어 있음)'));
    console.log('');

    const prisma = new PrismaClient();
    try {
        // 후보를 넓게 긁어 온다. role 이 어긋난 계정을 찾는 것이 목적이라
        // role=ADMIN 만 조회하면 정작 찾아야 할 계정이 빠진다.
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { role: 'ADMIN' },
                    { isAdmin: true },
                    ...adminEmails.map((email) => ({ email: { equals: email, mode: 'insensitive' } })),
                ],
            },
            select: {
                email: true,
                name: true,
                status: true,
                isAdmin: true,
                role: true,
                accessExpiresAt: true,
                mustChangePassword: true,
                createdAt: true,
            },
        });

        const candidates = summarizeAdminCandidates(users, adminEmails);
        const usable = candidates.filter((candidate) => candidate.canEnterAdminMode);

        if (candidates.length === 0) {
            console.log('관리자 권한이 있는 계정이 없습니다.');
        } else {
            console.log(`관리자 후보 ${candidates.length}개 (지금 들어갈 수 있는 계정 ${usable.length}개)`);
            console.log('');
            for (const candidate of candidates) {
                console.log(formatCandidate(candidate));
            }
        }

        const missing = findMissingAdminEmails(users, adminEmails);
        if (missing.length > 0) {
            console.log('');
            console.log('ADMIN_EMAILS 에 있으나 계정이 없는 주소: ' + missing.join(', '));
        }

        console.log('');
        console.log('다음 단계');
        if (usable.length > 0) {
            console.log('  비밀번호만 잊었다면 위 계정의 비밀번호를 새로 발급한다.');
        } else if (candidates.length > 0) {
            console.log('  위 계정의 권한을 바로잡고 비밀번호도 새로 받는다.');
        } else {
            console.log('  쓰던 계정을 관리자로 올린다. 계정이 없으면 새로 만든다.');
        }
        console.log('    npm run seed:admin -- <이메일> --reset-password');
        console.log('');
        console.log('  자세한 절차는 docs/2026-09-02-admin-account-recovery.md 를 본다.');
        console.log('');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    // P2021 은 테이블 없음. 마이그레이션을 아직 안 돌린 경우다.
    if (error?.code === 'P2021' || /does not exist/i.test(error?.message ?? '')) {
        console.error('테이블이 없습니다. 먼저 마이그레이션을 적용하세요.');
        console.error('  npx prisma migrate deploy');
    } else {
        console.error('관리자 계정 조회에 실패했습니다.');
        console.error(error?.message ?? error);
    }
    process.exitCode = 1;
});
