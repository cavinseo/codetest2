// 스키마의 FK·캐스케이드·RESTRICT 가 실제 DB 에서 어떻게 동작하는지 확인하는 통합 테스트다.
//
// 단위 테스트는 Prisma 를 전부 mock 하므로 FK 위반·캐스케이드·RESTRICT 가 한 번도 실행되지
// 않는다. 그래서 'system' 처럼 존재하지 않는 사용자 ID 를 invitedBy 에 넣는 버그가 474개
// 테스트를 모두 통과한 채로 살아 있었다. 이 파일은 INTEGRATION_DATABASE_URL 이 가리키는 DB 에
// 실제로 행을 쓰고 지워서 그 부류의 버그를 잡는다.
//
// 이 스위트는 행을 실제로 만들고 지우므로, 앱이 쓰는 POSTGRES_PRISMA_URL 과는 완전히 분리된
// INTEGRATION_DATABASE_URL 을 반드시 일회용 테스트 전용 DB 로 설정한 뒤 실행한다. 아래
// 안전장치는 (1) INTEGRATION_DATABASE_URL 이 비어 있는 경우와 (2) POSTGRES_PRISMA_URL 과
// 값이 같은 경우를 막는다. 그 값이 실제로 일회용 테스트 DB 를 가리키는지는 여전히 실행하는
// 사람이 확인해야 한다.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

// 안전장치 1: INTEGRATION_DATABASE_URL 이 없으면 알아보기 힘든 연결 오류 대신 분명한
// 메시지로 멈춘다. 이 검사가 어떤 it()/beforeAll() 보다도 먼저, 모듈을 불러오는 시점에
// 동기적으로 실행되기 때문에 조건을 만족하지 못하면 PrismaClient 생성조차 되지 않고 파일
// 전체가 즉시 실패한다.
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const appDatabaseUrl = process.env.POSTGRES_PRISMA_URL;

if (!integrationDatabaseUrl) {
    throw new Error(
        '통합 테스트 스위트는 앱과 분리된 INTEGRATION_DATABASE_URL 이 필요하다. ' +
            '이 스위트는 실제로 행을 만들고 지우므로 앱이 쓰는 POSTGRES_PRISMA_URL 을 ' +
            '가리켜서는 절대 안 된다. 일회용 테스트 전용 Postgres 를 가리키는 ' +
            'INTEGRATION_DATABASE_URL 을 설정한 뒤 다시 실행한다.'
    );
}

// 안전장치 2: 안전장치 1과는 독립적으로, INTEGRATION_DATABASE_URL 이 앱의
// POSTGRES_PRISMA_URL 과 바이트 단위로 같은 경우를 막는다. URL 이 "테스트 DB 처럼
// 보이는지" 추측하는 휴리스틱은 실패를 놓칠 수 있어 쓰지 않고, 두 값이 정확히 같은
// 경우만 막는다. 실행하는 사람이 변수를 잘못 복사해 넣는 실수를 여기서 잡는다.
if (integrationDatabaseUrl === appDatabaseUrl) {
    throw new Error(
        'INTEGRATION_DATABASE_URL 이 POSTGRES_PRISMA_URL 과 바이트 단위로 동일하다. ' +
            '통합 테스트 DB는 앱이 쓰는 데이터베이스와 반드시 분리되어야 한다. ' +
            '서로 다른 일회용 테스트 전용 Postgres 를 INTEGRATION_DATABASE_URL 에 설정한다.'
    );
}

const prisma = new PrismaClient({ datasources: { db: { url: integrationDatabaseUrl } } });

// 이번 실행에서 만드는 모든 행을 다른 실행·다른 개발자의 데이터와 겹치지 않게 구분하기
// 위한 접두사다. 정리(clean-up)도 이 실행이 만든 사용자(userId)로만 스코프를 좁혀서 한다.
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let sequence = 0;
function uid(label: string): string {
    sequence += 1;
    return `itest_${label}_${RUN_ID}_${sequence}`;
}

let userId: string;
let programId: string;

beforeAll(async () => {
    const user = await prisma.user.create({
        data: {
            id: uid('user'),
            email: `${uid('user')}@example.com`,
            passwordHash: 'x',
            status: 'APPROVED',
        },
    });
    userId = user.id;

    // Project.programId 는 NOT NULL 이라 프로젝트를 만들려면 먼저 프로그램이
    // 있어야 한다. 이 사용자를 그대로 담당 매니저로 쓴다 — FK 만족이 목적이라
    // 역할이 실제로 매니저인지는 이 스위트의 관심사가 아니다.
    const program = await prisma.program.create({
        data: {
            id: uid('prog'),
            name: 'itest program',
            organization: 'itest org',
            startsAt: new Date(),
            endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
            managerId: userId,
        },
    });
    programId = program.id;
});

// kano_responses.invitationId 는 KanoSurveyInvitation 에 대해 ON DELETE RESTRICT 다.
// project 를 캐스케이드로 지우기 전에 kanoResponse 를 먼저 지워야, 테스트가 도중에
// 실패해 행을 남기더라도(특히 마지막 테스트가 P2003 으로 실패하는 경우) 이 정리 단계가
// 같은 RESTRICT 충돌로 막히지 않는다. deleteMany 는 이번 실행의 userId 로만 스코프를
// 좁혀서, 이 파일이 만든 행 이외에는 절대 건드리지 않는다.
async function cleanupRunData(): Promise<void> {
    // beforeAll 이 실패해 userId 가 배정되기 전에 호출되면 아래 where 의 필터 값이
    // undefined 가 되어 deleteMany 가 조건 없는 전체 삭제로 바뀐다. 그런 상태면
    // 이 스위트가 만든 행도 없다는 뜻이므로 그냥 건너뛴다.
    if (!userId) return;
    await prisma.kanoResponse.deleteMany({ where: { project: { ownerId: userId } } });
    await prisma.project.deleteMany({ where: { ownerId: userId } });
}

afterEach(async () => {
    await cleanupRunData();
});

afterAll(async () => {
    try {
        await cleanupRunData();
        // Program 은 자신을 가리키는 Project 가 있으면 Restrict 로 지워지지
        // 않는다. cleanupRunData 가 이미 이 실행의 프로젝트를 전부 지웠으므로
        // 이 시점엔 안전하다.
        if (programId) {
            await prisma.program.deleteMany({ where: { id: programId } });
        }
        if (userId) {
            await prisma.user.deleteMany({ where: { id: userId } });
        }
    } finally {
        await prisma.$disconnect();
    }
});

async function makeProject(): Promise<string> {
    const project = await prisma.project.create({
        data: { id: uid('proj'), name: 'itest', ownerId: userId, programId },
    });
    return project.id;
}

describe('FK 와 캐스케이드 실측', () => {
    it('존재하지 않는 사용자 ID 로 초대를 만들 수 없다', async () => {
        const pid = await makeProject();

        await expect(
            prisma.kanoSurveyInvitation.create({
                data: {
                    id: uid('inv'),
                    projectId: pid,
                    email: `${uid('inv')}@example.com`,
                    token: uid('token'),
                    // Task 1 이 고쳤던 실제 버그값이다. users.id 로 존재한 적 없는 문자열이어야
                    // 이 테스트가 그 회귀를 정확히 재현한다.
                    invitedBy: 'system',
                    expiresAt: new Date(Date.now() + 86400000),
                },
            })
        ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('실재하는 사용자 ID 로는 초대를 만들 수 있다', async () => {
        const pid = await makeProject();

        const invitation = await prisma.kanoSurveyInvitation.create({
            data: {
                id: uid('inv_ok'),
                projectId: pid,
                email: `${uid('inv_ok')}@example.com`,
                token: uid('token_ok'),
                invitedBy: userId,
                expiresAt: new Date(Date.now() + 86400000),
            },
        });

        expect(invitation.invitedBy).toBe(userId);
    });

    it('요구사항을 지우면 Kano 응답이 함께 사라진다', async () => {
        const pid = await makeProject();

        const req = await prisma.customerRequirement.create({
            data: { id: uid('req'), projectId: pid, category: 'A', requirement: 'x', order: 0 },
        });
        const inv = await prisma.kanoSurveyInvitation.create({
            data: {
                id: uid('inv_c'),
                projectId: pid,
                email: `${uid('inv_c')}@example.com`,
                token: uid('token_c'),
                invitedBy: userId,
                expiresAt: new Date(Date.now() + 86400000),
            },
        });
        await prisma.kanoResponse.create({
            data: {
                id: uid('res_c'),
                projectId: pid,
                requirementId: req.id,
                invitationId: inv.id,
                respondentEmail: 'c@example.com',
                positiveAnswer: 1,
                negativeAnswer: 5,
                kanoCategory: 'A',
            },
        });

        await prisma.customerRequirement.delete({ where: { id: req.id } });

        const remaining = await prisma.kanoResponse.count({ where: { projectId: pid } });
        expect(remaining).toBe(0);
    });

    it('속성을 지우면 적합도가 함께 사라진다', async () => {
        const pid = await makeProject();

        const attr = await prisma.productAttribute.create({
            data: { id: uid('attr'), projectId: pid, order: 0 },
        });
        await prisma.attributeFitness.create({
            data: { id: uid('fit'), projectId: pid, attributeId: attr.id },
        });

        await prisma.productAttribute.delete({ where: { id: attr.id } });

        const remaining = await prisma.attributeFitness.count({ where: { projectId: pid } });
        expect(remaining).toBe(0);
    });

    it('응답이 있는 프로젝트도 삭제할 수 있다', async () => {
        // 열린 질문이다. kano_responses.invitationId 는 RESTRICT 다. project 삭제가
        // 캐스케이드로 kano_survey_invitations 와 kano_responses 를 둘 다 건드리는데,
        // Postgres 가 전자를 후자보다 먼저 처리하면 아직 그 초대를 참조하는 kano_responses
        // 행 때문에 P2003 으로 삭제 자체가 실패할 수 있다. 어느 결과든 정보이므로 여기서는
        // 성공을 기대하되, 실패 시 무엇을 의미하는지 진단 메시지로 남긴다. try/catch 로 감싸
        // 두 결과 모두 통과시키는 식으로 결과를 조작하지 않는다.
        const pid = await makeProject();

        const req = await prisma.customerRequirement.create({
            data: { id: uid('req_d'), projectId: pid, category: 'A', requirement: 'x', order: 0 },
        });
        const inv = await prisma.kanoSurveyInvitation.create({
            data: {
                id: uid('inv_d'),
                projectId: pid,
                email: `${uid('inv_d')}@example.com`,
                token: uid('token_d'),
                invitedBy: userId,
                expiresAt: new Date(Date.now() + 86400000),
            },
        });
        await prisma.kanoResponse.create({
            data: {
                id: uid('res_d'),
                projectId: pid,
                requirementId: req.id,
                invitationId: inv.id,
                respondentEmail: 'd@example.com',
                positiveAnswer: 1,
                negativeAnswer: 5,
                kanoCategory: 'A',
            },
        });

        await expect(
            prisma.project.delete({ where: { id: pid } }),
            'project 삭제가 P2003 으로 실패했다면, kano_responses.invitationId 가 ' +
                'KanoSurveyInvitation 에 대해 ON DELETE RESTRICT 이기 때문에 이 DB 의 캐스케이드 ' +
                '처리 순서가 kano_survey_invitations 를 kano_responses 보다 먼저 지운다는 뜻이다. ' +
                '보고서 H-6 이 지적한 FK 다이아몬드가 실재하므로, prisma/schema.prisma 의 ' +
                'KanoResponse.invitation 관계에 onDelete: Cascade 를 추가하고 ' +
                '`npx prisma migrate dev`로 마이그레이션을 만들어야 한다. ' +
                '반대로 이 단언이 통과했다면 다이아몬드는 실제로는 문제가 되지 않는다는 뜻이다.'
        ).resolves.toBeTruthy();
    });
});
