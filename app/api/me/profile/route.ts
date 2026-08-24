// 본인 회원등록 정보를 조회·수정하는 API.
//
// 경로에 userId 를 받지 않는다. 세션의 userId 만 쓰므로 남의 프로필에
// 손댈 수 없다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { hasAdminAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { isProfileCompleteForRole, memberProfileSchemaFor } from '@/lib/member-profile';

const log = createLogger('api/me/profile');

// 표시 이름. 앞뒤 공백은 다듬어 저장하되, 공백만 친 값은 빈 이름이므로 막는다.
const nameSchema = z
    .string({ invalid_type_error: '이름을 입력하세요.' })
    .trim()
    .min(1, '이름을 입력하세요.')
    .max(50, '이름은 50자를 넘을 수 없습니다.');

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const [profile, account] = await Promise.all([
            prisma.memberProfile.findUnique({
                where: { userId: authResult.userId },
            }),
            // 온보딩 화면이 비밀번호 변경 섹션을 띄울지 판단하려면 이 값이 필요하다.
            prisma.user.findUnique({
                where: { id: authResult.userId },
                select: { mustChangePassword: true },
            }),
        ]);

        return NextResponse.json({
            profile,
            needsProfile: !isProfileCompleteForRole(authResult.role, profile),
            // 관리자가 만든 계정은 임시 비밀번호를 강제 변경해야 온보딩을 마칠 수 있다.
            mustChangePassword: account?.mustChangePassword ?? false,
            role: authResult.role,
            // 사용자 정보 화면이 헤더와 기본 정보에 쓴다. 세션에서 온 값이라
            // 추가 조회가 없다. 이름·ID·역할은 화면에서 바꿀 수 없다(관리자 전용).
            name: authResult.name,
            email: authResult.email,
            // 화면의 관리자 링크·메뉴가 requireAdmin 과 같은 답을 보도록, 판정을
            // 여기서 한 번만 계산해 내려준다(ADMIN_EMAILS 로 들어온 계정도 포함).
            canAccessAdmin: hasAdminAccess(authResult),
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '프로필을 불러오지 못했습니다.' });
    }
}

export async function PUT(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        // 이름은 프로필 스키마 밖에 있다(User.name 컬럼). 프로필 스키마는 strict 라
        // name 을 섞어 보내면 "알 수 없는 항목" 으로 거부되므로 먼저 떼어낸다.
        const body = (await request.json()) as Record<string, unknown> | null;
        const { name: rawName, ...profileInput } = body ?? {};

        // 저장된 행을 검증 payload 에 섞지 않는다. 멘티 <-> 멘토 역할 전환은
        // 컬럼을 정리해 주지 않으므로, 예전 역할의 값(companyName/industry 등)이
        // 그대로 남아 있을 수 있다. 그 값을 body 와 섞어 strict 스키마에 넣으면
        // 알 수 없는 키로 거부되어 정상적인 수정이 막힌다. body 만으로 검증한다.
        const parsed = memberProfileSchemaFor(authResult.role).safeParse(profileInput);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }

        // name 을 아예 안 보내면 건드리지 않는다(온보딩은 프로필만 보낸다).
        // 보냈다면 값이 있어야 한다 — 빈 이름으로 지워지면 화면 곳곳이 "(null)" 이 된다.
        let nextName: string | undefined;
        if (rawName !== undefined) {
            const nameResult = nameSchema.safeParse(rawName);
            if (!nameResult.success) {
                return NextResponse.json({ error: nameResult.error.errors[0].message }, { status: 400 });
            }
            nextName = nameResult.data.trim();
        }

        const data = parsed.data as Record<string, unknown>;
        const now = new Date();

        // 현재 역할에 없는 항목은 명시적으로 null 을 써서, 예전 역할의 값이
        // 이 회원의 행에 계속 남아 있지 않게 한다.
        const fields = {
            organization: data.organization as string,
            jobTitle: (data.jobTitle as string) ?? null,
            phone: data.phone as string,
            expertise: (data.expertise as string) ?? null,
            careerYears: (data.careerYears as number) ?? null,
            careerSummary: (data.careerSummary as string) ?? null,
            companyName: (data.companyName as string) ?? null,
            industry: (data.industry as string) ?? null,
            foundedYear: (data.foundedYear as number) ?? null,
        };

        // 이름과 프로필을 한 트랜잭션으로 묶는다. 따로 쓰면 한쪽만 저장된 채로
        // 끝날 수 있고, 사용자는 무엇이 반영됐는지 알 수 없다.
        await prisma.$transaction([
            prisma.memberProfile.upsert({
                where: { userId: authResult.userId },
                // privacyConsentAt 은 최초 동의 시각이다. update 에는 넣지 않아
                // 이후 수정할 때마다 동의 시각이 갱신되지 않게 한다.
                create: { userId: authResult.userId, ...fields, privacyConsentAt: now },
                update: fields,
            }),
            ...(nextName === undefined ? [] : [
                prisma.user.update({ where: { id: authResult.userId }, data: { name: nextName } }),
            ]),
        ]);

        log.info('프로필 저장', { userId: authResult.userId, nameChanged: nextName !== undefined });
        return NextResponse.json({ success: true, name: nextName });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '프로필 저장에 실패했습니다.' });
    }
}
