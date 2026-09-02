// 최초 관리자 계정을 만들거나 기존 계정을 관리자로 올리는 1회용 시드 스크립트입니다.
//
// 관리자는 회원 전환으로 임명되지 않는다(lib/member-roles.ts 의 canTransitionRole).
// 그래서 첫 관리자는 화면 밖에서 만들어야 하는데, SQL 을 직접 치면 status·isAdmin·role
// 세 값을 손으로 맞춰야 하고 하나라도 어긋나면 화면이 이상하게 돈다. 이 스크립트가
// 그 셋을 한 번에 맞춘다.
//
//   node scripts/seed-admin.mjs                     .env 의 ADMIN_EMAILS 첫 주소를 쓴다
//   node scripts/seed-admin.mjs admin@example.com   주소를 직접 지정한다
//   node scripts/seed-admin.mjs --reset-password    기존 계정의 비밀번호도 새로 발급한다
//
// 기존 계정은 권한만 올리고 비밀번호는 건드리지 않는다. 남의 비밀번호를 말없이
// 갈아치우지 않기 위해서다. 비밀번호를 잊었으면 --reset-password 를 준다.
//
// 실제로 쓰기 전에는 대상 DB 를 보여주고 확인을 받는다. --yes 를 주면 건너뛴다.
import { createInterface } from 'node:readline/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { describeDatabase } from './admin-recovery.mjs';

const BCRYPT_ROUNDS = 10;

// 사람이 옮겨 적는 값이라 헷갈리는 글자(0/O, 1/I/l)를 뺀다.
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** 임시 비밀번호를 만든다. 화면에 한 번만 찍고 어디에도 저장하지 않는다. */
function generateTempPassword(length = 16) {
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) {
        out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
    }
    return out;
}

function shortId(prefix) {
    return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function resolveEmail() {
    const fromArg = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
    if (fromArg) return fromArg.trim();

    const first = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)[0];
    return first ?? null;
}

async function confirm(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await rl.question(question);
        return answer.trim().toLowerCase() === 'y';
    } finally {
        rl.close();
    }
}

async function main() {
    const email = resolveEmail();
    if (!email) {
        console.error('관리자 이메일을 찾지 못했습니다.');
        console.error('.env 의 ADMIN_EMAILS 를 채우거나 인자로 주소를 넘기세요.');
        console.error('  node scripts/seed-admin.mjs admin@example.com');
        process.exitCode = 1;
        return;
    }

    const dbUrl = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
    console.log('');
    console.log('  대상 DB : ' + describeDatabase(dbUrl));
    console.log('  대상 계정: ' + email);
    console.log('');

    if (process.argv.includes('--reset-password')) {
        console.log('  ! 비밀번호를 새로 발급하고 기존 로그인 세션을 모두 끊습니다.');
        console.log('');
    }

    const skipPrompt = process.argv.includes('--yes');
    if (!skipPrompt) {
        const ok = await confirm('이 DB 의 계정을 관리자로 만듭니다. 계속할까요? (y/N) ');
        if (!ok) {
            console.log('취소했습니다. 아무것도 바꾸지 않았습니다.');
            return;
        }
    }

    const prisma = new PrismaClient();
    try {
        // 이메일 대소문자는 로그인 조회와 맞추기 위해 입력값을 그대로 쓴다.
        const existing = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true, email: true, name: true, status: true, isAdmin: true, role: true },
        });

        let userId;
        let tempPassword = null;

        if (existing) {
            userId = existing.id;
            const resetPassword = process.argv.includes('--reset-password');
            if (resetPassword) tempPassword = generateTempPassword();

            await prisma.user.update({
                where: { id: existing.id },
                data: {
                    status: 'APPROVED',
                    isAdmin: true,
                    role: 'ADMIN',
                    // 비밀번호를 새로 발급하면 이미 발급된 세션도 끊는다.
                    // 그러지 않으면 예전 쿠키로 계속 들어올 수 있다.
                    ...(tempPassword
                        ? {
                            passwordHash: await bcrypt.hash(tempPassword, BCRYPT_ROUNDS),
                            sessionVersion: { increment: 1 },
                        }
                        : {}),
                },
            });
            console.log('기존 계정을 관리자로 올렸습니다.');
            console.log(`  이전 상태: status=${existing.status} isAdmin=${existing.isAdmin} role=${existing.role}`);
        } else {
            tempPassword = generateTempPassword();
            const created = await prisma.user.create({
                data: {
                    id: shortId('user'),
                    email,
                    name: '관리자',
                    passwordHash: await bcrypt.hash(tempPassword, BCRYPT_ROUNDS),
                    status: 'APPROVED',
                    isAdmin: true,
                    role: 'ADMIN',
                },
                select: { id: true },
            });
            userId = created.id;
            console.log('관리자 계정을 새로 만들었습니다.');
        }

        // 프로필이 없으면 일반 로그인이 프로필 작성 화면으로 보낸다.
        // 관리자는 공통 항목(소속·연락처)만 있으면 완성으로 본다.
        const profile = await prisma.memberProfile.findUnique({ where: { userId } });
        if (!profile) {
            await prisma.memberProfile.create({
                data: {
                    userId,
                    organization: '운영',
                    phone: '000-0000-0000',
                    privacyConsentAt: new Date(),
                },
            });
            console.log('기본 프로필을 만들었습니다. 로그인 후 실제 값으로 고치세요.');
        }

        console.log('');
        console.log('  status  = APPROVED');
        console.log('  isAdmin = true');
        console.log('  role    = ADMIN');
        console.log('');

        if (tempPassword) {
            console.log('  임시 비밀번호: ' + tempPassword);
            console.log('  이 값은 여기에만 표시됩니다. 로그인 후 바로 바꾸세요.');
        } else {
            console.log('  비밀번호는 그대로입니다. 기존 비밀번호로 로그인하세요.');
            console.log('  잊었다면 --reset-password 를 붙여 다시 실행하세요.');
        }

        console.log('');
        console.log('  이제 <주소>/admin 에서 로그인하면 됩니다.');
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
        console.error('관리자 시드에 실패했습니다.');
        console.error(error?.message ?? error);
    }
    process.exitCode = 1;
});
