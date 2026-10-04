import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isProjectWriteRole, requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { normalizeTechnicalName } from '@/lib/qfd-technical-sync';
import { assignTechnicalCoreGroups } from '@/lib/qfd-technical-groups';
import { synchronizeTechnicalCoreGroups, technicalOrderBy as orderBy } from '@/lib/qfd-technical-group-store';

const log = createLogger('api/qfd/technical');
const techSchema = z.object({
    name: z.string().transform(normalizeTechnicalName).pipe(z.string().min(1, '세부기능을 입력해 주세요.')),
    unit: z.string().optional(),
    targetValue: z.string().optional(),
});
const techCreateSchema = techSchema.extend({ groupIndex: z.number().int().nonnegative().optional() });
const techUpdateSchema = techSchema.extend({ id: z.string().min(1) });
const techDeleteSchema = z.union([
    z.object({ id: z.string().min(1) }).strict(),
    z.object({ groupIndex: z.number().int().nonnegative(), ids: z.array(z.string().min(1)).min(1) }).strict(),
]);
type Context = { params: Promise<{ id: string }> };

function failure(error: unknown) {
    if (error instanceof z.ZodError) {
        return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    log.error('세부기능 처리 오류', error);
    return NextResponse.json({ error: '세부기능 처리에 실패했습니다.' }, { status: 500 });
}

// 최초에는 기능을 채우고 이후 조회에서는 기존 기능의 핵심스펙 그룹만 갱신한다.
export async function GET(request: NextRequest, props: Context) {
    try {
        const { id: projectId } = await props.params;
        const access = await requireProjectAccess(request, projectId, { write: false });
        if (access instanceof NextResponse) return access;
        const canWrite = isProjectWriteRole(access.role);
        const technicalCharacteristics = canWrite ? await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
            const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { qfdTechnicalInitialized: true } });
            const entries = await tx.techTreeEntry.findMany({ where: { projectId }, select: { subSpec: true, coreSpec: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] });
            const rows = await synchronizeTechnicalCoreGroups(tx, projectId, entries, !project.qfdTechnicalInitialized);
            if (!project.qfdTechnicalInitialized) await tx.project.update({ where: { id: projectId }, data: { qfdTechnicalInitialized: true } });
            return rows;
        }, { timeout: 30000 }) : assignTechnicalCoreGroups(
            await prisma.technicalCharacteristic.findMany({ where: { projectId }, orderBy }),
            await prisma.techTreeEntry.findMany({ where: { projectId }, select: { subSpec: true, coreSpec: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] })
        );
        return NextResponse.json({ technicalCharacteristics: technicalCharacteristics.filter(t => t.name.trim()), canWrite });
    } catch (error) { return failure(error); }
}

// 그룹은 첫 세부기능과 함께 생성하고 기존 그룹에는 이름이 있는 세부기능만 추가한다.
export async function POST(request: NextRequest, props: Context) {
    try {
        const { id: projectId } = await props.params;
        const access = await requireProjectAccess(request, projectId, { write: true });
        if (access instanceof NextResponse) return access;
        const { groupIndex, ...data } = techCreateSchema.parse(await request.json());
        return await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
            const existing = await tx.technicalCharacteristic.findMany({ where: { projectId } });
            if (existing.some(t => normalizeTechnicalName(t.name) === data.name)) {
                return NextResponse.json({ error: '이미 추가된 세부기능입니다.' }, { status: 409 });
            }
            if (groupIndex !== undefined && !existing.some(t => t.groupIndex === groupIndex && t.name.trim())) {
                return NextResponse.json({ error: '그룹이 삭제되었습니다. 다시 불러온 뒤 추가해 주세요.' }, { status: 409 });
            }
            const created = await tx.technicalCharacteristic.create({
                data: {
                    id: generateId('tech'), projectId, ...data,
                    groupIndex: groupIndex ?? (existing.length ? Math.max(...existing.map(t => t.groupIndex)) + 1 : 0),
                    columnOrder: existing.length ? Math.max(...existing.map(t => t.columnOrder)) + 1 : 0,
                },
            });
            const entries = await tx.techTreeEntry.findMany({ where: { projectId }, select: { subSpec: true, coreSpec: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] });
            const technicalCharacteristics = await synchronizeTechnicalCoreGroups(tx, projectId, entries, false);
            const technicalCharacteristic = technicalCharacteristics.find(tech => tech.id === created.id)!;
            await tx.project.update({ where: { id: projectId }, data: { qfdTechnicalInitialized: true } });
            return NextResponse.json({ success: true, technicalCharacteristic, technicalCharacteristics });
        }, { timeout: 30000 });
    } catch (error) { return failure(error); }
}

// 세부기능 이름을 바꿔도 그룹과 관계 강도는 유지한다.
export async function PATCH(request: NextRequest, props: Context) {
    try {
        const { id: projectId } = await props.params;
        const access = await requireProjectAccess(request, projectId, { write: true });
        if (access instanceof NextResponse) return access;
        const { id, ...data } = techUpdateSchema.parse(await request.json());
        return await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
            const existing = await tx.technicalCharacteristic.findFirst({ where: { id, projectId }, select: { id: true } });
            if (!existing) return NextResponse.json({ error: '현재 프로젝트의 기술특성만 수정할 수 있습니다.' }, { status: 404 });
            const others = await tx.technicalCharacteristic.findMany({ where: { projectId, NOT: { id } }, select: { name: true } });
            if (others.some(t => normalizeTechnicalName(t.name) === data.name)) {
                return NextResponse.json({ error: '이미 추가된 세부기능입니다.' }, { status: 409 });
            }
            await tx.technicalCharacteristic.update({ where: { id }, data });
            const entries = await tx.techTreeEntry.findMany({ where: { projectId }, select: { subSpec: true, coreSpec: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] });
            const technicalCharacteristics = await synchronizeTechnicalCoreGroups(tx, projectId, entries, false);
            const technicalCharacteristic = technicalCharacteristics.find(tech => tech.id === id)!;
            await tx.project.update({ where: { id: projectId }, data: { qfdTechnicalInitialized: true } });
            return NextResponse.json({ success: true, technicalCharacteristic, technicalCharacteristics });
        }, { timeout: 30000 });
    } catch (error) { return failure(error); }
}

// FK Cascade가 삭제된 세부기능의 관계 강도·상관관계·기술 벤치마크를 함께 정리한다.
export async function DELETE(request: NextRequest, props: Context) {
    try {
        const { id: projectId } = await props.params;
        const access = await requireProjectAccess(request, projectId, { write: true });
        if (access instanceof NextResponse) return access;
        const data = techDeleteSchema.parse(await request.json());
        return await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
            let deletedIds: string[];
            if ('id' in data) {
                const existing = await tx.technicalCharacteristic.findFirst({ where: { id: data.id, projectId }, select: { id: true } });
                if (!existing) return NextResponse.json({ error: '현재 프로젝트의 기술특성만 삭제할 수 있습니다.' }, { status: 404 });
                deletedIds = [data.id];
                await tx.technicalCharacteristic.delete({ where: { id: data.id } });
            } else {
                const existing = await tx.technicalCharacteristic.findMany({ where: { projectId, groupIndex: data.groupIndex }, select: { id: true, name: true } });
                deletedIds = existing.filter(t => t.name.trim()).map(t => t.id);
                const confirmed = new Set(data.ids);
                if (!deletedIds.length || confirmed.size !== deletedIds.length || deletedIds.some(id => !confirmed.has(id))) {
                    return NextResponse.json({ error: '그룹의 세부기능이 변경되었습니다. 다시 불러온 뒤 삭제해 주세요.' }, { status: 409 });
                }
                await tx.technicalCharacteristic.deleteMany({ where: { projectId, id: { in: deletedIds } } });
            }
            await tx.project.update({ where: { id: projectId }, data: { qfdTechnicalInitialized: true } });
            return NextResponse.json({ success: true, deletedIds });
        });
    } catch (error) { return failure(error); }
}
