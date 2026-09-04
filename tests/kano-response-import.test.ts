// 파일 응답 수입의 삭제·초대·분류 계약을 검증한다.
import { describe, expect, it } from 'vitest';
import { classifyKanoResponse } from '../lib/kano-algorithm';
import {
    importKanoResponses,
    type KanoImportOptions,
    type KanoImportRespondent,
    type KanoImportTx,
} from '../lib/kano-response-import';

interface RecordedCall {
    name: string;
    args: unknown;
}

interface TxFixtureOptions {
    existingEmails?: string[];
    invitationIds?: string[];
}

function createTxFixture(options: TxFixtureOptions = {}): {
    tx: KanoImportTx;
    calls: RecordedCall[];
} {
    const calls: RecordedCall[] = [];
    let invitationIndex = 0;

    const tx: KanoImportTx = {
        kanoResponse: {
            async deleteMany(args) {
                calls.push({ name: 'kanoResponse.deleteMany', args });
                return { count: 0 };
            },
            async findMany(args) {
                calls.push({ name: 'kanoResponse.findMany', args });
                return (options.existingEmails ?? []).map((respondentEmail) => ({ respondentEmail }));
            },
            async createMany(args) {
                calls.push({ name: 'kanoResponse.createMany', args });
                return { count: args.data.length };
            },
        },
        kanoSurveyInvitation: {
            async deleteMany(args) {
                calls.push({ name: 'kanoSurveyInvitation.deleteMany', args });
                return { count: 0 };
            },
            async upsert(args) {
                calls.push({ name: 'kanoSurveyInvitation.upsert', args });
                const id = options.invitationIds?.[invitationIndex] ?? `invitation_${invitationIndex + 1}`;
                invitationIndex += 1;
                return { id };
            },
        },
    };

    return { tx, calls };
}

const now = new Date('2026-09-04T00:00:00.000Z');
const expiresAt = new Date('2026-09-04T01:00:00.000Z');

function createOptions(overrides: Partial<KanoImportOptions> = {}): KanoImportOptions {
    return {
        projectId: 'project_1',
        invitedBy: 'user_1',
        tokenPrefix: 'offline',
        writePolicy: 'append',
        invitationExpiresAt: () => expiresAt,
        now,
        ...overrides,
    };
}

function createRespondent(overrides: Partial<KanoImportRespondent> = {}): KanoImportRespondent {
    return {
        email: 'first@example.com',
        respondedAt: new Date('2026-09-03T12:00:00.000Z'),
        answers: [
            { requirementId: 'requirement_1', positiveAnswer: 1, negativeAnswer: 5 },
        ],
        ...overrides,
    };
}

function callsNamed(calls: RecordedCall[], name: string): RecordedCall[] {
    return calls.filter((call) => call.name === name);
}

describe('importKanoResponses', () => {
    it('append는 해당 이메일의 응답만 지우고 초대는 지우지 않는다', async () => {
        const { tx, calls } = createTxFixture();
        const respondents = [
            createRespondent(),
            createRespondent({ email: 'second@example.com' }),
        ];

        await importKanoResponses(tx, respondents, createOptions());

        expect(callsNamed(calls, 'kanoResponse.deleteMany')).toEqual([{
            name: 'kanoResponse.deleteMany',
            args: {
                where: {
                    projectId: 'project_1',
                    respondentEmail: { in: ['first@example.com', 'second@example.com'] },
                },
            },
        }]);
        expect(callsNamed(calls, 'kanoSurveyInvitation.deleteMany')).toHaveLength(0);
    });

    it('replace는 응답 전체와 초대 전체를 순서대로 지운다', async () => {
        const { tx, calls } = createTxFixture({ existingEmails: ['first@example.com'] });

        const result = await importKanoResponses(
            tx,
            [createRespondent()],
            createOptions({ writePolicy: 'replace' })
        );

        const deletionCalls = calls.filter((call) => call.name.endsWith('deleteMany'));
        expect(deletionCalls).toEqual([
            { name: 'kanoResponse.deleteMany', args: { where: { projectId: 'project_1' } } },
            { name: 'kanoSurveyInvitation.deleteMany', args: { where: { projectId: 'project_1' } } },
        ]);
        expect(callsNamed(calls, 'kanoResponse.findMany')).toHaveLength(0);
        expect(result.overwrittenRespondentCount).toBe(0);
    });

    it('초대를 프로젝트와 이메일로 upsert하고 옵션과 응답 시각을 보존한다', async () => {
        const { tx, calls } = createTxFixture();
        const expiryCalls: Date[] = [];
        const respondent = createRespondent({ answers: [] });

        await importKanoResponses(tx, [respondent], createOptions({
            invitationExpiresAt: (value) => {
                expiryCalls.push(value);
                return expiresAt;
            },
        }));

        const upsertCalls = callsNamed(calls, 'kanoSurveyInvitation.upsert');
        expect(upsertCalls).toHaveLength(1);
        const args = upsertCalls[0].args as {
            where: { projectId_email: { projectId: string; email: string } };
            update: { respondedAt: Date; isUsed: boolean };
            create: Record<string, unknown>;
            select: { id: boolean };
        };
        expect(args.where).toEqual({
            projectId_email: { projectId: 'project_1', email: 'first@example.com' },
        });
        expect(args.update).toEqual({ respondedAt: respondent.respondedAt, isUsed: true });
        expect(args.select).toEqual({ id: true });
        expect(Object.keys(args.create).sort()).toEqual([
            'email',
            'expiresAt',
            'id',
            'invitedBy',
            'isUsed',
            'projectId',
            'respondedAt',
            'token',
        ]);
        expect(String(args.create.id).startsWith('inv_')).toBe(true);
        expect(String(args.create.token).startsWith('offline_inv_')).toBe(true);
        expect(args.create.token).not.toBe('offline_inv_');
        expect(args.create.projectId).toBe('project_1');
        expect(args.create.email).toBe('first@example.com');
        expect(args.create.invitedBy).toBe('user_1');
        expect(args.create.expiresAt).toBe(expiresAt);
        expect(args.create.respondedAt).toBe(respondent.respondedAt);
        expect(args.create.isUsed).toBe(true);
        expect(expiryCalls).toEqual([now]);
    });

    it('응답자에게 지정된 토큰을 새 초대에 그대로 쓴다', async () => {
        const { tx, calls } = createTxFixture();

        await importKanoResponses(
            tx,
            [createRespondent({ token: 'offline_submission-1', answers: [] })],
            createOptions()
        );

        const args = callsNamed(calls, 'kanoSurveyInvitation.upsert')[0].args as {
            create: Record<string, unknown>;
        };
        expect(args.create.token).toBe('offline_submission-1');
    });

    it('답마다 초대와 Kano 분류가 연결된 행을 만든다', async () => {
        const { tx, calls } = createTxFixture({ invitationIds: ['invitation_a', 'invitation_b'] });
        const first = createRespondent({
            answers: [
                { requirementId: 'requirement_1', positiveAnswer: 1, negativeAnswer: 5 },
                { requirementId: 'requirement_2', positiveAnswer: 2, negativeAnswer: 5 },
            ],
        });
        const second = createRespondent({
            email: 'second@example.com',
            respondedAt: new Date('2026-09-03T13:00:00.000Z'),
            answers: [
                { requirementId: 'requirement_3', positiveAnswer: 5, negativeAnswer: 1 },
            ],
        });

        const result = await importKanoResponses(tx, [first, second], createOptions());

        const createManyCalls = callsNamed(calls, 'kanoResponse.createMany');
        expect(createManyCalls).toHaveLength(1);
        const rows = (createManyCalls[0].args as { data: Array<Record<string, unknown>> }).data;
        expect(rows).toHaveLength(3);
        expect(rows.map((row) => row.invitationId)).toEqual([
            'invitation_a',
            'invitation_a',
            'invitation_b',
        ]);
        expect(rows.map((row) => row.requirementId)).toEqual([
            'requirement_1',
            'requirement_2',
            'requirement_3',
        ]);
        expect(rows.map((row) => row.respondentEmail)).toEqual([
            'first@example.com',
            'first@example.com',
            'second@example.com',
        ]);
        expect(rows.map((row) => row.positiveAnswer)).toEqual([1, 2, 5]);
        expect(rows.map((row) => row.negativeAnswer)).toEqual([5, 5, 1]);
        expect(rows.map((row) => row.kanoCategory)).toEqual([
            classifyKanoResponse(1, 5),
            classifyKanoResponse(2, 5),
            classifyKanoResponse(5, 1),
        ]);
        expect(rows.map((row) => row.respondedAt)).toEqual([
            first.respondedAt,
            first.respondedAt,
            second.respondedAt,
        ]);
        expect(rows.every((row) => row.projectId === 'project_1')).toBe(true);
        expect(rows.every((row) => String(row.id).startsWith('response_'))).toBe(true);
        expect(result).toEqual({
            respondentCount: 2,
            importedCount: 3,
            overwrittenRespondentCount: 0,
        });

        const missingFixture = createTxFixture({ invitationIds: [''] });
        let caught: unknown;
        try {
            await importKanoResponses(missingFixture.tx, [createRespondent()], createOptions());
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeTruthy();
        expect((caught as Error).message).toBe('Invitation missing after upsert.');
    });

    it('append는 기존 응답자 수를 세고 replace는 항상 0을 돌려준다', async () => {
        const appendFixture = createTxFixture({
            existingEmails: ['first@example.com', 'second@example.com'],
        });
        const respondents = [
            createRespondent({ answers: [] }),
            createRespondent({ email: 'second@example.com', answers: [] }),
        ];

        const appendResult = await importKanoResponses(
            appendFixture.tx,
            respondents,
            createOptions()
        );

        expect(callsNamed(appendFixture.calls, 'kanoResponse.findMany')).toEqual([{
            name: 'kanoResponse.findMany',
            args: {
                where: {
                    projectId: 'project_1',
                    respondentEmail: { in: ['first@example.com', 'second@example.com'] },
                },
                select: { respondentEmail: true },
                distinct: ['respondentEmail'],
            },
        }]);
        expect(appendResult.overwrittenRespondentCount).toBe(2);

        const replaceFixture = createTxFixture({ existingEmails: ['first@example.com'] });
        const replaceResult = await importKanoResponses(
            replaceFixture.tx,
            [createRespondent({ answers: [] })],
            createOptions({ writePolicy: 'replace' })
        );
        expect(replaceResult.overwrittenRespondentCount).toBe(0);
        expect(callsNamed(replaceFixture.calls, 'kanoResponse.findMany')).toHaveLength(0);
    });

    it('답이 없으면 응답 행 생성을 요청하지 않는다', async () => {
        const { tx, calls } = createTxFixture();

        const result = await importKanoResponses(
            tx,
            [createRespondent({ answers: [] })],
            createOptions()
        );

        expect(callsNamed(calls, 'kanoResponse.createMany')).toHaveLength(0);
        expect(callsNamed(calls, 'kanoSurveyInvitation.upsert')).toHaveLength(1);
        expect(result).toEqual({
            respondentCount: 1,
            importedCount: 0,
            overwrittenRespondentCount: 0,
        });
    });

    it('응답자가 없으면 조회와 삭제를 요청하지 않는다', async () => {
        const { tx, calls } = createTxFixture();

        const result = await importKanoResponses(tx, [], createOptions());

        expect(callsNamed(calls, 'kanoResponse.findMany')).toHaveLength(0);
        expect(callsNamed(calls, 'kanoResponse.deleteMany')).toHaveLength(0);
        expect(callsNamed(calls, 'kanoSurveyInvitation.deleteMany')).toHaveLength(0);
        expect(callsNamed(calls, 'kanoSurveyInvitation.upsert')).toHaveLength(0);
        expect(callsNamed(calls, 'kanoResponse.createMany')).toHaveLength(0);
        expect(result).toEqual({
            respondentCount: 0,
            importedCount: 0,
            overwrittenRespondentCount: 0,
        });
    });
});
