// 배정 멘토의 결과보고서 초안을 저장하고 완료한 문서만 멘티에게 공개한다.
import { NextRequest, NextResponse } from 'next/server';
import type { FinalReport, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess, type ProjectAccess } from '@/lib/authorization';
import { REPORT_MAX_BYTES, completeReportSchema, reportDraftSchema, saveReportSchema } from '@/lib/final-report-payload';
import { createLogger } from '@/lib/logger';
import { errorCodeOf } from '@/lib/api-error';

const log = createLogger('api/final-report');
type Props = { params: Promise<{ id: string }> };
const privateHeaders = { 'Cache-Control': 'private, no-store' };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: privateHeaders });

class ReportError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}

function canBeAssignedMentor(access: ProjectAccess) {
    return access.user.role === 'MENTOR' || access.user.role === 'PROGRAM_MANAGER';
}

async function getAccess(request: NextRequest, id: string) {
    const access = await requireProjectAccess(request, id);
    if (access instanceof NextResponse) return access;
    const project = await prisma.project.findUnique({ where: { id }, select: {
        owner: { select: { mentorAssignment: { select: { mentorId: true, mentor: { select: { name: true } } } } } },
    } });
    if (!project) return json({ error: '프로젝트를 찾을 수 없습니다.' }, 404);
    const assignment = project.owner.mentorAssignment;
    const canEdit = canBeAssignedMentor(access) && assignment?.mentorId === access.user.userId;
    return { access, canEdit, canReadDraft: canEdit || access.user.role === 'ADMIN' || access.user.role === 'PROGRAM_MANAGER', mentorName: assignment?.mentor.name ?? null };
}

function metadata(report: FinalReport) {
    return {
        version: report.version, updatedAt: report.updatedAt,
        publishedAt: report.publishedAt, hasPublishedReport: report.published !== null,
        hasUnpublishedChanges: report.version !== report.publishedVersion,
    };
}

function failure(error: unknown) {
    if (error instanceof ReportError) return json({ error: error.message }, error.status);
    log.error('결과보고서 처리 실패', undefined, { code: errorCodeOf(error) ?? undefined });
    return json({ error: '결과보고서 처리에 실패했습니다. 다시 시도하세요.' }, 500);
}

export async function GET(request: NextRequest, props: Props) {
    try {
        const { id } = await props.params;
        const actor = await getAccess(request, id);
        if (actor instanceof NextResponse) return actor;
        const report = await prisma.finalReport.findUnique({ where: { projectId: id } });
        const view = actor.canReadDraft && request.nextUrl.searchParams.get('view') !== 'published' ? 'draft' : 'published';
        const common = { canEdit: actor.canEdit, mentorName: actor.mentorName, view,
            hasPublishedReport: report?.published != null, publishedAt: report?.publishedAt ?? null,
        };
        if (view === 'published') {
            // 공개 응답에는 초안의 내용·자유입력·그림이나 수정 메타데이터를 섞지 않는다.
            return json({ ...common, version: report?.publishedVersion ?? 0, updatedAt: report?.publishedAt ?? null,
                hasUnpublishedChanges: false, document: report?.published ?? null });
        }
        return json({ ...common, version: report?.version ?? 0, updatedAt: report?.updatedAt ?? null,
            hasUnpublishedChanges: report ? report.version !== report.publishedVersion : false, draft: report?.draft ?? null });
    } catch (error) { return failure(error); }
}

async function body(request: NextRequest) {
    if (Number(request.headers.get('content-length')) > REPORT_MAX_BYTES) throw new ReportError('보고서 용량이 큽니다. 이미지 크기나 내용을 줄여 주세요.', 413);
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > REPORT_MAX_BYTES) throw new ReportError('보고서 용량이 큽니다. 이미지 크기나 내용을 줄여 주세요.', 413);
    try { return JSON.parse(raw) as unknown; }
    catch { throw new ReportError('올바른 보고서 정보를 입력하세요.', 400); }
}

async function mutate(request: NextRequest, props: Props, complete: boolean) {
    try {
        const { id } = await props.params;
        const actor = await getAccess(request, id);
        if (actor instanceof NextResponse) return actor;
        if (!actor.canEdit) return json({ error: '배정된 멘토만 결과보고서를 저장·완료할 수 있습니다.' }, 403);
        const payload = await body(request);
        const parsed = complete ? completeReportSchema.safeParse(payload) : saveReportSchema.safeParse(payload);
        if (!parsed.success) return json({ error: '보고서 내용과 버전 정보를 확인하세요.' }, 400);
        const result = await prisma.$transaction(async tx => {
            // 프로젝트 소유 변경과 배정 해제는 이 잠금 뒤에 직렬화되어 저장 권한이 바뀌지 않는다.
            const projects = await tx.$queryRaw<Array<{ ownerId: string }>>`SELECT "ownerId" FROM "projects" WHERE "id" = ${id} FOR UPDATE`;
            if (!projects.length) throw new ReportError('프로젝트를 찾을 수 없습니다.', 404);
            const assignments = await tx.$queryRaw<Array<{ mentorId: string }>>`SELECT "mentorId" FROM "mentor_assignments" WHERE "menteeId" = ${projects[0].ownerId} FOR UPDATE`;
            if (assignments[0]?.mentorId !== actor.access.user.userId) throw new ReportError('멘토 배정이 변경되어 저장할 수 없습니다.', 403);
            const current = await tx.finalReport.findUnique({ where: { projectId: id } });
            if ((current?.version ?? 0) !== parsed.data.version) throw new ReportError('다른 화면에서 보고서가 변경되었습니다. 새로고침 후 다시 확인하세요.', 409);
            const version = parsed.data.version + 1;
            if (complete) {
                const draft = reportDraftSchema.safeParse(current?.draft);
                if (!current || !draft.success || !draft.data.document?.blocks.length || draft.data.previewNeedsRefresh) {
                    throw new ReportError('최신 입력으로 미리보기를 만들고 저장한 뒤 완료하세요.', 400);
                }
                return tx.finalReport.update({ where: { projectId: id }, data: {
                    published: draft.data.document as Prisma.InputJsonValue, publishedAt: new Date(),
                    publishedById: actor.access.user.userId, updatedById: actor.access.user.userId,
                    version, publishedVersion: version,
                } });
            }
            const saved = saveReportSchema.parse(payload);
            const data = { draft: saved.draft as Prisma.InputJsonValue, version, updatedById: actor.access.user.userId };
            return current
                ? tx.finalReport.update({ where: { projectId: id }, data })
                : tx.finalReport.create({ data: { ...data, projectId: id } });
        }, { timeout: 15_000 });
        return json({ success: true, ...metadata(result) });
    } catch (error) { return failure(error); }
}

export const PUT = (request: NextRequest, props: Props) => mutate(request, props, false);
export const POST = (request: NextRequest, props: Props) => mutate(request, props, true);
