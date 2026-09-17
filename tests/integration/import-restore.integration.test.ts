// 일회용 로컬 DB에서 백업 복원·설문 분석·연결 자료 보존과 실패 시 롤백을 검증한다.
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl || databaseUrl === process.env.POSTGRES_PRISMA_URL) throw new Error('분리된 로컬 테스트 DB가 필요합니다.');
const address = new URL(databaseUrl);
if (address.hostname !== '127.0.0.1' || address.pathname !== '/restore_safety_qa') throw new Error('일회용 restore_safety_qa 로컬 DB만 허용합니다.');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
vi.mock('../../lib/authorization', () => ({ requireProjectAccess: async () => ({ user: { userId: ownerId }, role: 'OWNER' }) }));
const { GET: exportProject } = await import('../../app/api/projects/[id]/export/route');
const { POST: importProject } = await import('../../app/api/projects/[id]/import-json/route');
const { POST: importExcel } = await import('../../app/api/projects/[id]/import/route');
const { GET: analyzeKano } = await import('../../app/api/projects/[id]/kano/analysis/route');
const ownerId = randomUUID();
const programId = randomUUID();
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (id: string) => new NextRequest(`http://localhost/api/projects/${id}`);
async function exportBackup(id: string) {
    const response = await exportProject(request(id), params(id));
    expect(response.status).toBe(200);
    return response.json();
}
async function restore(id: string, payload: unknown) {
    return importProject(new NextRequest(`http://localhost/api/projects/${id}/import-json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }), params(id));
}
async function makeProject(populated = false) {
    const project = await db.project.create({ data: { name: '복원 검증', ownerId, programId } });
    if (!populated) return project.id;
    const requirement = await db.customerRequirement.create({ data: { projectId: project.id, category: '성능', requirement: '빠른 응답' } });
    const second = await db.customerRequirement.create({ data: { projectId: project.id, category: '성능', requirement: '안정성', order: 1 } });
    const tech1 = await db.technicalCharacteristic.create({ data: { projectId: project.id, name: '응답시간', unit: 'ms' } });
    const tech2 = await db.technicalCharacteristic.create({ data: { projectId: project.id, name: '처리량' } });
    const attr = await db.productAttribute.create({ data: { projectId: project.id, attribute: '신뢰성' } });
    const invite = await db.kanoSurveyInvitation.create({ data: {
        projectId: project.id, email: 'respondent@example.test', token: randomUUID(), expiresAt: new Date('2026-01-01'), isUsed: true,
    } });
    await db.kanoResponse.createMany({ data: [requirement, second].map(row => ({
        projectId: project.id, requirementId: row.id, invitationId: invite.id, respondentEmail: invite.email,
        positiveAnswer: 1, negativeAnswer: 5, kanoCategory: 'O', respondedAt: new Date('2025-12-01'),
    })) });
    await db.benchmark.create({ data: { projectId: project.id, requirementId: requirement.id, company: 'self', score: 3 } });
    await db.technicalBenchmark.create({ data: { projectId: project.id, technicalCharId: tech1.id, company: 'self', value: '25 ms' } });
    await db.techCorrelation.create({ data: { projectId: project.id, techId1: tech1.id, techId2: tech2.id, correlation: '+' } });
    await db.qFDMatrix.create({ data: { projectId: project.id, requirementId: requirement.id, technicalCharId: tech1.id, strength: '강' } });
    await db.attributeFitness.create({ data: { projectId: project.id, attributeId: attr.id, importance: 4, currentLevel: 2, targetLevel: 5 } });
    return project.id;
}
async function snapshot(id: string) {
    const { exportedAt: _exportedAt, ...data } = await exportBackup(id);
    return data;
}

beforeAll(async () => {
    await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.test`, passwordHash: 'test', status: 'APPROVED' } });
    await db.program.create({ data: { id: programId, name: '로컬 QA', organization: 'QA', startsAt: new Date(), endsAt: new Date('2099-01-01'), managerId: ownerId } });
});
afterAll(async () => {
    await db.kanoResponse.deleteMany({ where: { project: { ownerId } } });
    await db.project.deleteMany({ where: { ownerId } });
    await db.program.deleteMany({ where: { id: programId } });
    await db.user.deleteMany({ where: { id: ownerId } });
    await db.$disconnect();
});

describe('실제 DB 백업 복원', () => {
    it('다른 프로젝트로 복원한 모든 연결 자료와 Kano 분석을 보존한다', async () => {
        const source = await makeProject(true);
        const target = await makeProject();
        const backup = await exportBackup(source);
        expect((await restore(target, backup)).status).toBe(200);
        const restored = await exportBackup(target);
        expect(restored.benchmarks).toEqual([expect.objectContaining({ company: 'self', score: 3, projectId: target })]);
        expect(restored.technicalBenchmarks).toEqual([expect.objectContaining({ company: 'self', value: '25 ms', projectId: target })]);
        expect(restored.techCorrelations).toEqual([expect.objectContaining({ correlation: '+', projectId: target })]);
        expect(restored.qfdRelationships).toHaveLength(1);
        expect(restored.attributeFitnesses).toEqual([expect.objectContaining({ importance: 4, targetLevel: 5 })]);
        expect(restored.kanoResponses).toHaveLength(2);
        const responses = await db.kanoResponse.findMany({ where: { projectId: target }, include: { invitation: true, requirement: true } });
        for (const row of responses) {
            expect(row.invitation.projectId).toBe(target);
            expect(row.requirement.projectId).toBe(target);
            expect(row.invitation.isUsed).toBe(true);
            expect(row.respondedAt).toEqual(new Date('2025-12-01'));
            expect(row.invitationId).not.toBe(backup.kanoResponses[0].invitationId);
        }
        expect(await db.kanoSurveyInvitation.count({ where: { projectId: target } })).toBe(1);
        const analysis = await analyzeKano(request(target), params(target));
        expect(await analysis.json()).toMatchObject({ totalResponses: 2, uniqueRespondents: 1, requirements: expect.any(Array) });
    });

    it('동일 프로젝트에 반복 복원해도 초대 중복이나 연결 자료 유실이 없다', async () => {
        const projectId = await makeProject(true);
        const backup = await exportBackup(projectId);
        const invitationId = backup.kanoResponses[0].invitationId;
        for (let i = 0; i < 2; i++) {
            expect((await restore(projectId, { ...backup, confirmCascade: true })).status).toBe(200);
            const restored = await exportBackup(projectId);
            for (const key of ['benchmarks', 'technicalBenchmarks', 'techCorrelations', 'qfdRelationships', 'attributeFitnesses']) expect(restored[key]).toHaveLength(1);
            expect(restored.kanoResponses).toHaveLength(2);
            expect(restored.kanoResponses[0].invitationId).toBe(invitationId);
        }
        expect(await db.kanoSurveyInvitation.count({ where: { projectId } })).toBe(1);
    });

    it('원래 설문 초대가 삭제된 예전 백업도 새 프로젝트에서 분석 가능하다', async () => {
        const source = await makeProject(true);
        const target = await makeProject();
        const { technicalBenchmarks: _technicalBenchmarks, ...legacyBackup } = await exportBackup(source);
        await db.kanoResponse.deleteMany({ where: { projectId: source } });
        await db.kanoSurveyInvitation.deleteMany({ where: { projectId: source } });
        expect((await restore(target, legacyBackup)).status).toBe(200);
        expect(await (await analyzeKano(request(target), params(target))).json()).toMatchObject({ totalResponses: 2, uniqueRespondents: 1 });
    });

    it('다른 프로젝트의 부모를 참조하는 부분 복원을 거절하고 기존 자료를 유지한다', async () => {
        const source = await makeProject(true);
        const target = await makeProject(true);
        const before = await snapshot(target);
        const backup = await exportBackup(source);
        expect((await restore(target, { benchmarks: backup.benchmarks })).status).toBe(400);
        expect(await snapshot(target)).toEqual(before);
    });

    it('현재 프로젝트 부모를 사용하는 부분 복원은 다른 자료를 유지한다', async () => {
        const projectId = await makeProject(true);
        const before = await snapshot(projectId);
        expect((await restore(projectId, { benchmarks: before.benchmarks.map((row: object) => ({ ...row, score: 5 })) })).status).toBe(200);
        const after = await snapshot(projectId);
        expect(after.benchmarks[0].score).toBe(5);
        expect({ ...after, benchmarks: [] }).toEqual({ ...before, benchmarks: [] });
    });

    it('복원 중 고유키 오류가 발생하면 삭제와 초대 변경까지 모두 롤백한다', async () => {
        const projectId = await makeProject(true);
        const before = await snapshot(projectId);
        const invitations = await db.kanoSurveyInvitation.findMany({ where: { projectId } });
        const response = await restore(projectId, { ...before, confirmCascade: true, benchmarks: [before.benchmarks[0], before.benchmarks[0]] });
        expect(response.status).toBe(500);
        expect(await snapshot(projectId)).toEqual(before);
        expect(await db.kanoSurveyInvitation.findMany({ where: { projectId } })).toEqual(invitations);
    });

    it.each([
        { sheet: '제품속성표', rows: [['제품명', '고객명', '세분시장', '제품속성'], ['새 제품', '고객', '시장', '속성']], impact: 'attributeFitnesses' },
        { sheet: 'QFD', rows: [['Spec', '응답시간', '측정단위'], ['', 'ms', ''], [], ['', '200', '']], impact: 'technicalBenchmarks' },
    ])('$sheet 엑셀 덮어쓰기는 확인 전 연결 자료를 보존한다', async ({ sheet, rows, impact }) => {
        const projectId = await makeProject(true);
        const before = await snapshot(projectId);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheet);
        const form = new FormData();
        form.append('file', new File([new Uint8Array(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))], 'replace.xlsx'));
        form.append('action', 'apply');
        form.append('writePolicy', 'replace');
        const response = await importExcel(new NextRequest(`http://localhost/api/projects/${projectId}/import`, { method: 'POST', body: form }), params(projectId));
        expect(response.status).toBe(409);
        expect((await response.json()).cascadeImpact[impact]).toBe(1);
        expect(await snapshot(projectId)).toEqual(before);
    });
});
