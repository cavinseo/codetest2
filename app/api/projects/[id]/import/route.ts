import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { parseExcelFile, ParsedExcelData, ParsedSheet } from '@/lib/excel-parser';
import {
    parseWorkbookImport,
    type WorkbookImportRecords,
    type WorkbookWritePolicy,
} from '@/lib/workbook-importer';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 8;
const PREVIEW_COL_LIMIT = 8;

function isSupportedExcelFile(fileName: string) {
    const lowerName = fileName.toLowerCase();
    return lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
}

function parseRequestedSheetNames(rawValue: FormDataEntryValue | null) {
    if (!rawValue || typeof rawValue !== 'string') return [];
    return rawValue
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
}

function parseAction(rawValue: FormDataEntryValue | null) {
    return rawValue === 'apply' ? 'apply' : 'preview';
}

function parseWritePolicy(rawValue: FormDataEntryValue | null): WorkbookWritePolicy {
    return rawValue === 'append' ? 'append' : 'replace';
}

function normalizeSheetName(name: string) {
    return name.toLowerCase().replace(/[\s_\-()[\]{}]/g, '');
}

function getRequestedSheetAliases(requestedName: string) {
    const normalized = normalizeSheetName(requestedName);
    if (normalized.includes('제품속성')) return ['제품속성표', '제품속성서', '제품속성'];
    if (normalized.includes('고객요구사항')) return ['고객요구사항도출표', '고객요구사항', '요구사항도출'];
    if (normalized.includes('asis') || normalized.includes('as-is') || normalized.includes('스펙')) return ['AS-IS스펙표', 'AS-IS 스펙표', 'ASIS스펙', '스펙표'];
    return [requestedName];
}

function matchesRequestedSheetName(sheetName: string, requestedName: string) {
    const normalizedSheetName = normalizeSheetName(sheetName);
    return getRequestedSheetAliases(requestedName).some((alias) => {
        const normalizedAlias = normalizeSheetName(alias);
        return (
            normalizedSheetName === normalizedAlias ||
            normalizedSheetName.includes(normalizedAlias) ||
            normalizedAlias.includes(normalizedSheetName)
        );
    });
}

function countNonEmptyCells(sheet: ParsedSheet) {
    return sheet.data.reduce((total, row) => {
        return total + row.filter((value) => value !== null && value !== undefined && `${value}`.trim() !== '').length;
    }, 0);
}

function toSheetPreview(sheet: ParsedSheet) {
    return {
        name: sheet.name,
        rowCount: sheet.rowCount,
        colCount: sheet.colCount,
        nonEmptyCellCount: countNonEmptyCells(sheet),
        formulaCount: sheet.formulas ? Object.keys(sheet.formulas).length : 0,
        previewRows: sheet.data
            .slice(0, PREVIEW_ROW_LIMIT)
            .map((row) => row.slice(0, PREVIEW_COL_LIMIT)),
    };
}

function selectSheets(parsedData: ParsedExcelData, requestedSheetNames: string[]) {
    if (requestedSheetNames.length === 0) {
        return parsedData.sheets;
    }

    const missingSheets: string[] = [];
    const selectedSheets = requestedSheetNames
        .map((requestedName) => {
            const sheet = parsedData.sheets.find(
                (item) => matchesRequestedSheetName(item.name, requestedName)
            );
            if (!sheet) missingSheets.push(requestedName);
            return sheet;
        })
        .filter((sheet): sheet is ParsedSheet => Boolean(sheet));

    return { selectedSheets, missingSheets };
}

function selectedSheetsInclude(selectedSheets: string[], keywords: string[]) {
    return selectedSheets.some((sheetName) => {
        const normalizedSheetName = normalizeSheetName(sheetName);
        return keywords.some((keyword) => normalizedSheetName.includes(normalizeSheetName(keyword)));
    });
}

async function applyImportedRecords(
    projectId: string,
    records: WorkbookImportRecords,
    writePolicy: WorkbookWritePolicy,
    metadata: { userId: string; fileName: string; fileSize: number; selectedSheets: string[] }
) {
    const counts = Object.fromEntries(
        Object.entries(records).map(([key, value]) => [key, value.length])
    ) as Record<keyof WorkbookImportRecords, number>;

    await prisma.$transaction(async (tx) => {
        if (writePolicy === 'replace') {
            if (records.specFunctions.length > 0) await tx.specFunction.deleteMany({ where: { projectId } });
            if (records.productAttributes.length > 0) {
                await tx.attributeFitness.deleteMany({ where: { projectId } });
                await tx.productAttribute.deleteMany({ where: { projectId } });
            }
            if (records.customerRequirements.length > 0) await tx.customerRequirement.deleteMany({ where: { projectId } });
            if (records.technicalCharacteristics.length > 0) {
                await tx.qFDMatrix.deleteMany({ where: { projectId } });
                await tx.techCorrelation.deleteMany({ where: { projectId } });
                await tx.technicalCharacteristic.deleteMany({ where: { projectId } });
            }
            if (
                records.improvementItems.length > 0
                || selectedSheetsInclude(metadata.selectedSheets, ['개선포인트도출', '개선포인트'])
            ) await tx.improvementItem.deleteMany({ where: { projectId } });
            if (records.targetSpecs.length > 0) await tx.targetSpec.deleteMany({ where: { projectId } });
            if (records.techRoadmaps.length > 0) await tx.techRoadmap.deleteMany({ where: { projectId } });
            if (records.assetItems.length > 0) await tx.assetItem.deleteMany({ where: { projectId } });
            if (records.fundingPlans.length > 0) await tx.fundingPlan.deleteMany({ where: { projectId } });
            if (records.fundingSources.length > 0) await tx.fundingSource.deleteMany({ where: { projectId } });
            if (records.salesEstimates.length > 0) await tx.salesEstimate.deleteMany({ where: { projectId } });
        }

        if (records.salesEstimates.length > 0) {
            await tx.salesEstimate.createMany({
                data: records.salesEstimates.map((row) => ({
                    customer: row.customer,
                    period: row.period === 'Y_PLUS_1' ? 'Y_PLUS_1' : 'Y',
                    amount: Number(row.amount) || 0,
                    futureAmount: 0,
                    competitor: row.competitor,
                    order: row.order,
                    projectId,
                })),
            });
        }
        if (records.specFunctions.length > 0) {
            await tx.specFunction.createMany({ data: records.specFunctions.map((row) => ({ ...row, projectId })) });
        }
        if (records.productAttributes.length > 0) {
            await tx.productAttribute.createMany({ data: records.productAttributes.map((row) => ({ ...row, projectId })) });
        }
        if (records.customerRequirements.length > 0) {
            await tx.customerRequirement.createMany({ data: records.customerRequirements.map((row) => ({ ...row, projectId })) });
        }
        if (records.technicalCharacteristics.length > 0) {
            await tx.technicalCharacteristic.createMany({ data: records.technicalCharacteristics.map((row) => ({ ...row, projectId })) });
        }
        if (records.improvementItems.length > 0) {
            await tx.improvementItem.createMany({ data: records.improvementItems.map((row) => ({ ...row, projectId })) });
        }
        if (records.targetSpecs.length > 0) {
            await tx.targetSpec.createMany({ data: records.targetSpecs.map((row) => ({ ...row, projectId })) });
        }
        if (records.techRoadmaps.length > 0) {
            await tx.techRoadmap.createMany({ data: records.techRoadmaps.map((row) => ({ ...row, projectId })) });
        }
        if (records.assetItems.length > 0) {
            await tx.assetItem.createMany({ data: records.assetItems.map((row) => ({ ...row, projectId })) });
        }
        if (records.fundingPlans.length > 0) {
            await tx.fundingPlan.createMany({ data: records.fundingPlans.map((row) => ({ ...row, projectId })) });
        }
        if (records.fundingSources.length > 0) {
            await tx.fundingSource.createMany({ data: records.fundingSources.map((row) => ({ ...row, projectId })) });
        }

        await tx.migrationHistory.create({
            data: {
                projectId,
                userId: metadata.userId,
                fileName: metadata.fileName,
                fileSize: metadata.fileSize,
                sheetsMigrated: JSON.stringify({
                    selectedSheets: metadata.selectedSheets,
                    counts,
                    writePolicy,
                }),
                status: 'SUCCESS',
            },
        });
    });

    return counts;
}

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;

    try {
        const projectId = params.id;
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const requestedSheetNames = parseRequestedSheetNames(formData.get('sheetNames'));
        const action = parseAction(formData.get('action'));
        const writePolicy = parseWritePolicy(formData.get('writePolicy'));

        const accessResult = await requireProjectAccess(request, projectId, { write: action === 'apply' });
        if (accessResult instanceof NextResponse) return accessResult;

        if (!file) {
            return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: '파일 크기는 10MB를 초과할 수 없습니다.' },
                { status: 400 }
            );
        }

        if (!isSupportedExcelFile(file.name)) {
            return NextResponse.json(
                { error: '.xlsx 또는 .xls 파일만 업로드할 수 있습니다.' },
                { status: 400 }
            );
        }

        const parsedData = await parseExcelFile(file);
        if (parsedData.parseErrors.some((error) => error.severity === 'error')) {
            return NextResponse.json(
                {
                    error: '엑셀 파일을 분석하지 못했습니다.',
                    parseErrors: parsedData.parseErrors,
                },
                { status: 400 }
            );
        }

        const selection = selectSheets(parsedData, requestedSheetNames);
        const selectedSheets = Array.isArray(selection) ? selection : selection.selectedSheets;
        const missingSheets = Array.isArray(selection) ? [] : selection.missingSheets;

        if (missingSheets.length > 0) {
            return NextResponse.json(
                {
                    error: '요청한 워크시트를 찾을 수 없습니다.',
                    missingSheets,
                    availableSheets: parsedData.sheets.map((sheet) => sheet.name),
                },
                { status: 400 }
            );
        }

        const importResult = parseWorkbookImport(parsedData, { sheetNames: requestedSheetNames });

        if (importResult.errors.length > 0) {
            return NextResponse.json(
                {
                    error: '요청한 워크시트를 찾을 수 없습니다.',
                    errors: importResult.errors,
                    availableSheets: parsedData.sheets.map((sheet) => sheet.name),
                },
                { status: 400 }
            );
        }

        let appliedCounts: Record<string, number> | null = null;
        if (action === 'apply') {
            if (importResult.formulaIssues.length > 0) {
                return NextResponse.json(
                    {
                        error: '엑셀 파일에 깨진 수식이 있어 반영을 중단했습니다.',
                        formulaIssues: importResult.formulaIssues,
                    },
                    { status: 400 }
                );
            }
            appliedCounts = await applyImportedRecords(projectId, importResult.records, writePolicy, {
                userId: accessResult.user.userId,
                fileName: parsedData.fileName,
                fileSize: parsedData.fileSize,
                selectedSheets: importResult.selectedSheets,
            });
        }

        return NextResponse.json({
            success: true,
            readOnly: action !== 'apply',
            applied: action === 'apply',
            writePolicy,
            mode: requestedSheetNames.length > 0 ? 'worksheet' : 'workbook',
            workbook: {
                fileName: parsedData.fileName,
                fileSize: parsedData.fileSize,
                totalSheets: parsedData.sheets.length,
                availableSheets: parsedData.sheets.map((sheet) => sheet.name),
            },
            sheetsProcessed: selectedSheets.length,
            selectedSheets: selectedSheets.map((sheet) => sheet.name),
            recognizedSheets: importResult.recognizedSheets,
            unknownSheets: importResult.unknownSheets,
            sheetPreviews: selectedSheets.map(toSheetPreview),
            requirementCount: importResult.counts.customerRequirements,
            counts: importResult.counts,
            appliedCounts,
            extracted: {
                customerRequirements: importResult.records.customerRequirements.slice(0, 50),
            },
            warnings: importResult.warnings,
            errors: importResult.errors,
            formulaIssues: importResult.formulaIssues,
            parseErrors: parsedData.parseErrors,
        });
    } catch (error: unknown) {
        console.error('Excel read-only import failed:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : '엑셀 파일 분석 중 오류가 발생했습니다.',
            },
            { status: 500 }
        );
    }
}
