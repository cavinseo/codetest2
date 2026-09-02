// 관리자 계정을 잃었을 때 "누가 관리자인가, 왜 못 들어가는가"를 판정하는 순수 로직입니다.
//
// DB 도 환경 변수도 여기서 읽지 않는다. 값을 받아 판정만 하므로 테스트가 실DB 없이 돈다.
// 실제 조회와 출력은 scripts/find-admin.mjs 가 맡는다.

/** ADMIN_EMAILS 환경 변수를 소문자 주소 배열로 바꾼다. 비교를 소문자로 고정한다. */
export function parseAdminEmails(raw) {
    return (raw || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function isAdminEmail(email, adminEmails) {
    return adminEmails.includes(email.toLowerCase());
}

/**
 * 이 계정으로 관리자 모드에 들어갈 수 있는가. 못 들어가면 무엇이 막는지 함께 돌려준다.
 *
 * 관문이 둘이라 둘 다 본다 — 로그인(app/api/auth/login)과 관리자 게이트
 * (lib/authorization.ts 의 hasAdminAccess). 하나만 보면 "비밀번호는 맞는데 관리자
 * 화면이 안 열린다" 같은 상황의 원인을 짚지 못한다.
 *
 * ALLOW_DEV_ADMIN 우회는 일부러 셈하지 않는다. 복구는 배포된 사이트로 다시 들어가는
 * 일인데, 개발용 우회가 켜진 로컬 기준으로 "들어갈 수 있음"이라고 답하면 헛걸음이 된다.
 */
export function diagnoseAdminAccess(user, adminEmails, now = new Date()) {
    const blockers = [];

    if (user.status !== 'APPROVED') {
        blockers.push(`status 가 ${user.status} 라 로그인 자체가 거부된다.`);
    }

    // lib/member-roles.ts 의 isAccessExpired 와 같은 규칙이다. 스크립트에서 TS 를 그대로
    // 불러 쓸 수 없어 여기에 다시 적었고, 어긋나지 않도록 테스트가 두 판정을 맞춰 본다.
    if (user.accessExpiresAt && user.accessExpiresAt.getTime() <= now.getTime()) {
        blockers.push('이용 기간이 만료돼 로그인이 거부된다.');
    }

    if (user.role !== 'ADMIN') {
        // 역할이 첫 관문이라, 역할이 아니면 isAdmin·ADMIN_EMAILS 는 봐야 소용이 없다.
        blockers.push(`시스템 역할이 ${user.role} 다. 관리자 모드는 role=ADMIN 만 통과한다.`);
    } else if (!user.isAdmin && !isAdminEmail(user.email, adminEmails)) {
        blockers.push('isAdmin 플래그가 꺼져 있고 ADMIN_EMAILS 에도 없다.');
    }

    return { canEnterAdminMode: blockers.length === 0, blockers };
}

/**
 * 관리자일 가능성이 있는 계정만 골라 진단을 붙인다.
 *
 * role 이 ADMIN 이 아니어도 isAdmin 플래그나 ADMIN_EMAILS 에 걸리면 후보로 남긴다.
 * 계정을 잃은 사람이 찾는 것이 바로 그 어긋난 계정이라서다.
 *
 * 쓸 수 있는 계정을 먼저 보여 준다. 목록이 길어도 첫 줄만 보면 되게 하려는 것이다.
 */
export function summarizeAdminCandidates(users, adminEmails, now = new Date()) {
    return users
        .filter((user) => user.role === 'ADMIN' || user.isAdmin || isAdminEmail(user.email, adminEmails))
        .map((user) => ({ ...user, ...diagnoseAdminAccess(user, adminEmails, now) }))
        .sort((a, b) => {
            if (a.canEnterAdminMode !== b.canEnterAdminMode) return a.canEnterAdminMode ? -1 : 1;
            return a.email.localeCompare(b.email);
        });
}

/**
 * ADMIN_EMAILS 에는 있는데 계정이 없는 주소를 돌려준다.
 * 이 경우 환경 변수만 믿고 기다려도 로그인할 계정 자체가 없다.
 */
export function findMissingAdminEmails(users, adminEmails) {
    const existing = new Set(users.map((user) => user.email.toLowerCase()));
    return adminEmails.filter((email) => !existing.has(email));
}

/** 접속 문자열에서 비밀번호를 지우고 어느 DB 인지만 보여준다. */
export function describeDatabase(url) {
    if (!url) return '(설정되지 않음)';
    try {
        const parsed = new URL(url);
        return `${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}${parsed.pathname}`;
    } catch {
        return '(형식을 알 수 없는 접속 문자열)';
    }
}
