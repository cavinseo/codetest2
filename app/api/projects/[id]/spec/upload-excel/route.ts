import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

type FlatSpecRow = {
    core: string;
    sub: string;
    detail: string;
    technology: string;
};

type ParsedSpec = {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string;
    name: string;
    technology?: string;
    order: number;
};

type WritePolicy = 'append' | 'replace';

type SheetLayout = 'asisSpec' | 'productAttribute' | 'targetSpec';

type HeaderMatch = {
    index: number;
    layout: SheetLayout;
};

function isSupportedExcelFile(fileName: string) {
    const lowerName = fileName.toLowerCase();
    return lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
}

function parseWritePolicy(rawValue: FormDataEntryValue | null): WritePolicy {
    return rawValue === 'append' ? 'append' : 'replace';
}

function normalizeCell(value: unknown) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeForSearch(value: string) {
    return value.toLowerCase().replace(/\s+/g, '');
}

function includesAny(value: string, keywords: string[]) {
    const normalized = normalizeForSearch(value);
    return keywords.some((keyword) => normalized.includes(normalizeForSearch(keyword)));
}

function detectHeaderLayout(row: unknown[]): SheetLayout | null {
    const joined = row.map(normalizeCell).join('|');
    const asisScore = [
        includesAny(joined, ['핵심', 'core']),
        includesAny(joined, ['세부', 'sub']),
        includesAny(joined, ['세세부', 'detail']),
        includesAny(joined, ['기술', 'technology']),
    ].filter(Boolean).length;
    if (asisScore >= 2) return 'asisSpec';

    if (includesAny(joined, ['제품속성']) && includesAny(joined, ['기술역량', '기술 역량', 'tech'])) {
        return 'productAttribute';
    }

    if (includesAny(joined, ['스펙분류', '사양분류']) && includesAny(joined, ['세부항목', '사양항목', '기술적특성'])) {
        return 'targetSpec';
    }

    return null;
}

function findHeaderRow(rows: unknown[][]): HeaderMatch | null {
    for (let index = 0; index < Math.min(rows.length, 20); index++) {
        const layout = detectHeaderLayout(rows[index]);
        if (layout) return { index, layout };
    }
    return null;
}

function inferFallbackColumns(rows: unknown[][]) {
    const firstDataRow = rows.find((row) => row.some((cell) => normalizeCell(cell)));
    const firstCell = normalizeCell(firstDataRow?.[0]);
    const startsWithNumberColumn = Boolean(firstCell) && (/^\d+$/.test(firstCell) || includesAny(firstCell, ['no', '번호']));
    return startsWithNumberColumn
        ? { core: 1, sub: 2, detail: 3, technology: 4 }
        : { core: 0, sub: 1, detail: 2, technology: 3 };
}

function findColumnByKeywords(headerRow: unknown[], keywords: string[]) {
    return headerRow.findIndex((cell) => includesAny(normalizeCell(cell), keywords));
}

function inferColumns(headerRow: unknown[], rows: unknown[][], layout: SheetLayout) {
    const fallback = inferFallbackColumns(rows);
    const columns = { ...fallback };

    if (layout === 'productAttribute') {
        const productAttributeCol = findColumnByKeywords(headerRow, ['제품속성']);
        const techCapabilityCol = findColumnByKeywords(headerRow, ['기술역량', '기술 역량', 'tech']);
        const benefitCol = findColumnByKeywords(headerRow, ['제공혜택', '고객니즈', '고객 니즈', 'benefit', 'need']);
        if (productAttributeCol >= 0) columns.core = productAttributeCol;
        if (techCapabilityCol >= 0) columns.sub = techCapabilityCol;
        if (benefitCol >= 0) columns.detail = benefitCol;
        return columns;
    }

    if (layout === 'targetSpec') {
        const categoryCol = findColumnByKeywords(headerRow, ['스펙분류', '사양분류']);
        const subCol = findColumnByKeywords(headerRow, ['세부항목', '사양항목']);
        const specCol = findColumnByKeywords(headerRow, ['기술적특성', '기술적 특성', 'specitem']);
        const techCol = findColumnByKeywords(headerRow, ['개선여부', '적용기술', 'technology']);
        if (categoryCol >= 0) columns.core = categoryCol;
        if (subCol >= 0) columns.sub = subCol;
        if (specCol >= 0) columns.detail = specCol;
        if (techCol >= 0) columns.technology = techCol;
        return columns;
    }

    const coreCol = findColumnByKeywords(headerRow, ['핵심기능', '핵심스펙', '핵심 스펙', 'core']);
    const subCol = findColumnByKeywords(headerRow, ['세부기능', '세부스펙', '세부 스펙', 'sub']);
    const detailCol = findColumnByKeywords(headerRow, ['세세부기능', '세세부스펙', '세세부 스펙', '세세부', 'detail']);
    const techCol = findColumnByKeywords(headerRow, ['적용기술', '적용 기술', '기술적특성', '기술적 특성', 'technology']);

    if (coreCol >= 0) columns.core = coreCol;
    if (subCol >= 0) columns.sub = subCol;
    if (detailCol >= 0) columns.detail = detailCol;
    if (techCol >= 0) columns.technology = techCol;
    if (detailCol < 0 && techCol >= 0) columns.detail = -1;

    return columns;
}

function parseRowsFromWorksheet(sheet: XLSX.WorkSheet) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
    });
    const header = findHeaderRow(rows);
    if (!header) return [];

    const columns = inferColumns(rows[header.index], rows, header.layout);
    const parsedRows: FlatSpecRow[] = [];

    for (const row of rows.slice(header.index + 1)) {
        const core = normalizeCell(row[columns.core]);
        const sub = normalizeCell(row[columns.sub]);
        const detail = normalizeCell(row[columns.detail]);
        const technology = normalizeCell(row[columns.technology]);
        const rowText = [core, sub, detail, technology].join('');
        const meaningfulValues = [core, sub, detail, technology].filter((value) => value && !/^\d+$/.test(value));

        if (!rowText || meaningfulValues.length === 0) continue;
        if (includesAny(rowText, ['no핵심', '번호핵심', '핵심스펙세부스펙', '제품명고객명'])) continue;

        parsedRows.push({ core, sub, detail, technology });
    }

    return parsedRows;
}

function getCandidateSheetNames(workbook: XLSX.WorkBook, requestedSheetName: string) {
    if (requestedSheetName) return [requestedSheetName];

    const priorityKeywords = [
        ['AS-IS스펙표', 'AS-IS 스펙표', 'ASIS스펙표', 'AS-IS', '스펙표', 'spec'],
        ['기능기술체계도', '기술요구사항', '핵심스펙'],
        ['제품속성표', '제품속성'],
        ['최종목표스펙도출', '목표스펙'],
    ];

    const result: string[] = [];
    for (const keywords of priorityKeywords) {
        for (const sheetName of workbook.SheetNames) {
            if (result.includes(sheetName)) continue;
            if (keywords.some((keyword) => includesAny(sheetName, [keyword]))) {
                result.push(sheetName);
            }
        }
    }

    for (const sheetName of workbook.SheetNames) {
        if (!result.includes(sheetName)) result.push(sheetName);
    }

    return result;
}

function flattenRowsToSpecs(rows: FlatSpecRow[]) {
    const specs: ParsedSpec[] = [];
    const coreMap = new Map<string, string>();
    const subMap = new Map<string, string>();
    const specById = new Map<string, ParsedSpec>();
    let order = 0;
    let lastCore = '';
    let lastSub = '';

    for (const row of rows) {
        const currentCore = row.core || lastCore;
        const currentSub = row.sub || (row.core ? '' : lastSub);
        const detail = row.detail;
        const technology = row.technology;

        if (!currentCore) continue;

        let coreId = coreMap.get(currentCore);
        if (!coreId) {
            coreId = `excel_core_${order}`;
            const coreSpec: ParsedSpec = { id: coreId, level: 'CORE', name: currentCore, order: order++ };
            specs.push(coreSpec);
            specById.set(coreId, coreSpec);
            coreMap.set(currentCore, coreId);
        }
        lastCore = currentCore;

        if (!currentSub) {
            const coreSpec = specById.get(coreId);
            if (coreSpec && technology && !coreSpec.technology) coreSpec.technology = technology;
            continue;
        }

        const subKey = `${currentCore}\u0000${currentSub}`;
        let subId = subMap.get(subKey);
        if (!subId) {
            subId = `excel_sub_${order}`;
            const subSpec: ParsedSpec = { id: subId, level: 'SUB', parentId: coreId, name: currentSub, order: order++ };
            specs.push(subSpec);
            specById.set(subId, subSpec);
            subMap.set(subKey, subId);
        }
        lastSub = currentSub;

        if (!detail) {
            const subSpec = specById.get(subId);
            if (subSpec && technology && !subSpec.technology) subSpec.technology = technology;
            continue;
        }

        specs.push({
            id: `excel_detail_${order}`,
            level: 'DETAIL',
            parentId: subId,
            name: detail,
            technology,
            order: order++,
        });
    }

    return specs;
}

async function saveSpecs(projectId: string, specs: ParsedSpec[], writePolicy: WritePolicy) {
    const orderOffset = writePolicy === 'append'
        ? (await prisma.specFunction.aggregate({
            where: { projectId },
            _max: { order: true },
        }))._max.order ?? -1
        : -1;

    if (writePolicy === 'replace') {
        await prisma.specFunction.deleteMany({ where: { projectId } });
    }
    const idMapping = new Map<string, string>();

    for (const core of specs.filter((item) => item.level === 'CORE')) {
        const created = await prisma.specFunction.create({
            data: {
                projectId,
                level: 'CORE',
                name: core.name,
                technology: core.technology || null,
                order: orderOffset + 1 + core.order,
            },
        });
        idMapping.set(core.id, created.id);
    }

    for (const sub of specs.filter((item) => item.level === 'SUB')) {
        const created = await prisma.specFunction.create({
            data: {
                projectId,
                level: 'SUB',
                parentId: sub.parentId ? idMapping.get(sub.parentId) ?? null : null,
                name: sub.name,
                technology: sub.technology || null,
                order: orderOffset + 1 + sub.order,
            },
        });
        idMapping.set(sub.id, created.id);
    }

    for (const detail of specs.filter((item) => item.level === 'DETAIL')) {
        await prisma.specFunction.create({
            data: {
                projectId,
                level: 'DETAIL',
                parentId: detail.parentId ? idMapping.get(detail.parentId) ?? null : null,
                name: detail.name,
                technology: detail.technology || null,
                order: orderOffset + 1 + detail.order,
            },
        });
    }

    return prisma.specFunction.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
    });
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;

        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        const formData = await request.formData();
        const file = formData.get('file');
        const requestedSheetName = normalizeCell(formData.get('sheetName'));
        const writePolicy = parseWritePolicy(formData.get('writePolicy'));

        if (!(file instanceof File)) {
            return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: '파일 크기는 10MB를 초과할 수 없습니다.' }, { status: 400 });
        }
        if (!isSupportedExcelFile(file.name)) {
            return NextResponse.json({ error: '.xlsx 또는 .xls 파일만 업로드할 수 있습니다.' }, { status: 400 });
        }

        const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
            type: 'buffer',
            cellFormula: true,
        });
        const candidateSheetNames = getCandidateSheetNames(workbook, requestedSheetName);
        if (requestedSheetName && !workbook.Sheets[requestedSheetName]) {
            return NextResponse.json({
                error: 'AS-IS 스펙표 워크시트를 찾을 수 없습니다.',
                availableSheets: workbook.SheetNames,
            }, { status: 400 });
        }

        let sheetName = '';
        let flatRows: FlatSpecRow[] = [];
        let parsedSpecs: ParsedSpec[] = [];

        for (const candidateSheetName of candidateSheetNames) {
            const sheet = workbook.Sheets[candidateSheetName];
            if (!sheet) continue;

            const candidateRows = parseRowsFromWorksheet(sheet);
            const candidateSpecs = flattenRowsToSpecs(candidateRows);
            if (candidateSpecs.length === 0) continue;

            sheetName = candidateSheetName;
            flatRows = candidateRows;
            parsedSpecs = candidateSpecs;
            break;
        }

        if (parsedSpecs.length === 0) {
            return NextResponse.json({
                error: '업로드한 엑셀에서 스펙 내용을 찾지 못했습니다. AS-IS 스펙표에 핵심기능, 세부기능, 세세부기능 또는 적용기술 값이 있는지 확인하세요.',
                checkedSheets: candidateSheetNames,
                availableSheets: workbook.SheetNames,
            }, { status: 400 });
        }

        const specFunctions = await saveSpecs(projectId, parsedSpecs, writePolicy);

        return NextResponse.json({
            success: true,
            sheetName,
            importedRows: flatRows.length,
            specCount: specFunctions.length,
            writePolicy,
            specFunctions,
            availableSheets: workbook.SheetNames,
        });
    } catch (error) {
        console.error('AS-IS spec Excel upload failed:', error);
        return NextResponse.json({ error: 'AS-IS 스펙표 업로드에 실패했습니다.' }, { status: 500 });
    }
}
