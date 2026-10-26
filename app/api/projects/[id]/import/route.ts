import { NextRequest, NextResponse } from 'next/server';
import { cascadeConfirmResponse } from '@/lib/cascade-confirm-response';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { parseExcelFile, type ParsedExcelData, type ParsedSheet } from '@/lib/excel-parser';
import { parseWorkbookImport } from '@/lib/workbook-importer';
import { selectSheets, toSheetPreview } from '@/lib/workbook-import-sheets';
import { applyImportedRecords, DuplicateTechnicalNameError } from '@/lib/workbook-import-apply';
import {
    countCascadeImpact,
    describeCascadeImpact,
    hasCascadeImpact,
} from '@/lib/import-cascade-guard';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { parseWritePolicy } from '@/lib/write-policy';
import { guardUploadedExcel } from '@/lib/upload-guard';

const log = createLogger('api/import');

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

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;

    try {
        const projectId = params.id;
        const formData = await request.formData();
        const upload = guardUploadedExcel(formData.get('file'));
        const requestedSheetNames = parseRequestedSheetNames(formData.get('sheetNames'));
        const action = parseAction(formData.get('action'));
        const writePolicy = parseWritePolicy(formData.get('writePolicy'));
        const confirmCascade = formData.get('confirmCascade') === 'true';

        const accessResult = await requireProjectAccess(request, projectId, { write: action === 'apply' });
        if (accessResult instanceof NextResponse) return accessResult;

        // 크기·형식 검사는 다른 업로드 라우트와 같은 기준을 쓴다(2026-10-25 코드 리뷰 D5).
        if (!upload.ok) return NextResponse.json({ error: upload.failure.error }, { status: upload.failure.status });
        const file = upload.file;

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

        // 고객요구사항을 replace 로 덮어쓰면 Kano 응답·벤치마크·QFD 관계가 캐스케이드로
        // 함께 지워진다. preview 단계에서 건수를 보여주고, apply 는 사용자가 확인한
        // 경우에만 진행시킨다.
        const replacesCustomerRequirements =
            writePolicy === 'replace' && importResult.records.customerRequirements.length > 0;
        const cascadeImpact = await countCascadeImpact(prisma, projectId, {
            replacesCustomerRequirements,
            replacesProductAttributes: writePolicy === 'replace' && importResult.records.productAttributes.length > 0,
            replacesTechnicalCharacteristics: writePolicy === 'replace' && importResult.records.technicalCharacteristics.length > 0,
        });

        let appliedCounts: Record<string, number> | null = null;
        if (action === 'apply') {
            if (hasCascadeImpact(cascadeImpact) && !confirmCascade) {
                return cascadeConfirmResponse(describeCascadeImpact(cascadeImpact), cascadeImpact);
            }
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

        return NextResponse.json(importResponseBody({
            action, writePolicy, requestedSheetNames, parsedData, selectedSheets, importResult, cascadeImpact, appliedCounts,
        }));
    } catch (error: unknown) {
        if (error instanceof DuplicateTechnicalNameError) {
            return NextResponse.json({ error: '중복된 기술특성이 있습니다. 기존 항목과 파일의 기술특성 이름을 확인해 주세요.' }, { status: 409 });
        }
        // projectId 는 try 블록 스코프라 여기서는 params.id 를 쓴다.
        return toErrorResponse(error, {
            log,
            message: '가져오기에 실패했습니다.',
            context: { projectId: params.id },
        });
    }
}

/** 미리보기와 반영이 같은 모양으로 돌려주는 결과. 화면은 이 하나로 두 단계를 그린다. */
function importResponseBody(result: {
    action: 'apply' | 'preview';
    writePolicy: ReturnType<typeof parseWritePolicy>;
    requestedSheetNames: string[];
    parsedData: ParsedExcelData;
    selectedSheets: ParsedSheet[];
    importResult: ReturnType<typeof parseWorkbookImport>;
    cascadeImpact: Awaited<ReturnType<typeof countCascadeImpact>>;
    appliedCounts: Record<string, number> | null;
}) {
    const { action, writePolicy, requestedSheetNames, parsedData, selectedSheets, importResult, cascadeImpact, appliedCounts } = result;
    return {
        success: true,
        readOnly: action !== 'apply',
        applied: action === 'apply',
        writePolicy,
        cascadeImpact,
        cascadeWarning: describeCascadeImpact(cascadeImpact),
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
    };
}
