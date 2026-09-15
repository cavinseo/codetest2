// 워크시트 원본 쓰기 권한 없이 배정된 멘토가 의견만 작성하도록 분리한다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/authorization';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
const log = createLogger('worksheet-comments');
const worksheet = z.enum(['overview', 'sales', 'spec', 'attributes', 'fitness', 'requirements', 'kano', 'kano-aggregation', 'qfd', 'tech-tree', 'improvements', 'target-spec', 'tech-roadmap', 'dev-plan', 'assets', 'funding-plan', 'funding-source']);
const contentSchema = z.string().trim().min(1).max(5000);
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const projectId = (await props.params).id;
    const access = await requireProjectAccess(request, projectId);
    if (access instanceof NextResponse) return access;
    try {
        const parsedWorksheet = worksheet.safeParse(request.nextUrl.searchParams.get('worksheetId'));
        if (!parsedWorksheet.success) return NextResponse.json({ error: '워크시트를 선택하세요.' }, { status: 400 });
        const owner = await prisma.project.findUnique({ where: { id: projectId }, select: { owner: { select: { mentorAssignment: { select: { mentorId: true } } } } } });
        const canComment = access.user.role === 'ADMIN' || owner?.owner.mentorAssignment?.mentorId === access.user.userId;
        const scope = { projectId, worksheetId: parsedWorksheet.data };
        if (request.method === 'GET') {
            const comments = await prisma.worksheetComment.findMany({ where: scope, include: { author: { select: { name: true } } }, orderBy: { createdAt: 'asc' } });
            return NextResponse.json({ comments, canComment, userId: access.user.userId });
        }
        if (!canComment) return NextResponse.json({ error: '배정된 멘토만 의견을 작성할 수 있습니다.' }, { status: 403 });
        const parsed = z.object({ id: z.string().min(1).optional(), content: contentSchema.optional() }).safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({ error: '의견은 1~5,000자로 입력하세요.' }, { status: 400 });
        if (request.method === 'POST') {
            if (!parsed.data.content) return NextResponse.json({ error: '의견을 입력하세요.' }, { status: 400 });
            const comment = await prisma.worksheetComment.create({ data: { ...scope, authorId: access.user.userId, content: parsed.data.content } });
            return NextResponse.json({ comment }, { status: 201 });
        }
        if (!parsed.data.id) return NextResponse.json({ error: '의견을 선택하세요.' }, { status: 400 });
        const where = { ...scope, id: parsed.data.id, authorId: access.user.userId };
        if (request.method === 'DELETE') {
            const result = await prisma.worksheetComment.deleteMany({ where });
            return NextResponse.json({ success: result.count === 1 }, { status: result.count === 1 ? 200 : 403 });
        }
        if (!parsed.data.content) return NextResponse.json({ error: '의견을 입력하세요.' }, { status: 400 });
        const result = await prisma.worksheetComment.updateMany({ where, data: { content: parsed.data.content } });
        return NextResponse.json({ success: result.count === 1 }, { status: result.count === 1 ? 200 : 403 });
    } catch (error) { return toErrorResponse(error, { log, message: '의견 처리에 실패했습니다.' }); }
}
export const POST = GET;
export const PATCH = GET;
export const DELETE = GET;
