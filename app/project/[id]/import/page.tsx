'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type UploadMode = 'workbook' | 'worksheet';
type UploadStatus = 'idle' | 'parsing' | 'success' | 'error';
type WritePolicy = 'replace' | 'append';

interface SheetPreview {
    name: string;
    rowCount: number;
    colCount: number;
    nonEmptyCellCount: number;
    formulaCount: number;
    previewRows: unknown[][];
}

interface ImportResult {
    success: boolean;
    readOnly: boolean;
    applied?: boolean;
    writePolicy?: WritePolicy;
    mode: UploadMode;
    workbook: {
        fileName: string;
        fileSize: number;
        totalSheets: number;
        availableSheets: string[];
    };
    sheetsProcessed: number;
    selectedSheets: string[];
    recognizedSheets?: string[];
    unknownSheets?: string[];
    sheetPreviews: SheetPreview[];
    requirementCount: number;
    counts?: Record<string, number>;
    appliedCounts?: Record<string, number> | null;
    extracted: {
        customerRequirements: Array<{
            category: string;
            subcategory?: string;
            requirement: string;
        }>;
    };
    warnings: string[];
    errors: string[];
    formulaIssues?: Array<{
        sheet: string;
        cell: string;
        formula: string;
        message: string;
    }>;
}

const RECOMMENDED_SHEETS = [
    '자사매출추정표',
    'AS-IS스펙표',
    '제품속성표',
    '고객요구사항도출표',
    'QFD',
    '개선포인트도출',
    '최종목표스펙도출',
    '향후목표고객LIST',
    '핵심자산과 보완자산표',
    '자금소요계획표',
    '자금조달계획표',
];

const COUNT_LABELS: Record<string, string> = {
    salesEstimates: '매출추정',
    specFunctions: 'AS-IS 스펙',
    productAttributes: '제품속성',
    customerRequirements: '고객요구사항',
    technicalCharacteristics: '기술특성',
    improvementItems: '개선포인트',
    targetSpecs: '최종목표스펙',
    techRoadmaps: '향후목표고객',
    assetItems: '핵심/보완자산',
    fundingPlans: '자금소요',
    fundingSources: '자금조달',
};

export default function ImportPage() {
    const params = useParams();
    const projectId = params.id as string;

    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [result, setResult] = useState<ImportResult | null>(null);
    const [uploadMode, setUploadMode] = useState<UploadMode>('workbook');
    const [sheetNames, setSheetNames] = useState('');
    const [writePolicy, setWritePolicy] = useState<WritePolicy>('replace');

    const availableSheetText = useMemo(() => {
        return result?.workbook.availableSheets.join(', ') || '';
    }, [result]);

    const positiveCounts = useMemo(() => {
        return Object.entries(result?.counts ?? {}).filter(([, count]) => count > 0);
    }, [result]);

    const resetResult = () => {
        setUploadStatus('idle');
        setErrorMessage('');
        setResult(null);
    };

    const acceptFile = (selectedFile: File) => {
        const fileName = selectedFile.name.toLowerCase();
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            setFile(selectedFile);
            resetResult();
        } else {
            setErrorMessage('.xlsx 또는 .xls 파일만 업로드할 수 있습니다.');
        }
    };

    const submitImport = async (action: 'preview' | 'apply') => {
        if (!file) return;
        if (action === 'preview') {
            setIsUploading(true);
            setUploadStatus('parsing');
            setResult(null);
        } else {
            setIsApplying(true);
        }
        setErrorMessage('');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('action', action);
            formData.append('writePolicy', writePolicy);
            if (uploadMode === 'worksheet' && sheetNames.trim()) {
                formData.append('sheetNames', sheetNames);
            }

            const response = await fetch(`/api/projects/${projectId}/import`, {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();

            if (!response.ok) {
                const available = data.availableSheets?.length
                    ? ` 사용 가능한 시트: ${data.availableSheets.join(', ')}`
                    : '';
                const formulaIssues = data.formulaIssues?.length
                    ? ` 깨진 수식: ${data.formulaIssues.map((issue: any) => `${issue.sheet}!${issue.cell}`).join(', ')}`
                    : '';
                throw new Error(`${data.error || '엑셀 업로드 처리에 실패했습니다.'}${available}${formulaIssues}`);
            }

            setResult(data);
            setUploadStatus('success');
        } catch (error) {
            setUploadStatus('error');
            setErrorMessage(error instanceof Error ? error.message : '엑셀 업로드 처리에 실패했습니다.');
        } finally {
            setIsUploading(false);
            setIsApplying(false);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="min-h-screen bg-gray-900">
            <header className="border-b border-gray-700 bg-gray-800">
                <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-4">
                        <Link href={`/project/${projectId}`} className="text-gray-400 transition-colors hover:text-white">
                            프로젝트로 돌아가기
                        </Link>
                        <div className="h-6 w-px bg-gray-700" />
                        <div>
                            <h1 className="text-2xl font-bold text-white">엑셀 워크시트 가져오기</h1>
                            <p className="mt-1 text-sm text-gray-400">
                                전체 워크북 또는 선택 워크시트를 분석하고 프로젝트 데이터로 반영합니다.
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="space-y-6">
                    <div className="card border border-blue-500/30 bg-blue-500/10">
                        <h3 className="mb-2 font-semibold text-white">업로드 방식</h3>
                        <ul className="space-y-1 text-sm text-gray-300">
                            <li>전체 워크북을 한 번에 분석하거나, 지정한 워크시트만 분석할 수 있습니다.</li>
                            <li>분석 결과를 확인한 뒤 시스템 반영을 실행합니다.</li>
                            <li>반영 방식은 기존 값 교체 또는 기존 값에 추가 중 선택할 수 있습니다.</li>
                        </ul>
                    </div>

                    <div className="card">
                        <h2 className="mb-6 text-xl font-bold text-white">파일 선택</h2>

                        {!file ? (
                            <div
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    setIsDragging(true);
                                }}
                                onDragLeave={(event) => {
                                    event.preventDefault();
                                    setIsDragging(false);
                                }}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    setIsDragging(false);
                                    const droppedFile = event.dataTransfer.files[0];
                                    if (droppedFile) acceptFile(droppedFile);
                                }}
                                className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-all ${isDragging
                                    ? 'border-blue-500 bg-blue-500/10'
                                    : 'border-gray-600 hover:border-blue-500 hover:bg-gray-800/50'
                                    }`}
                            >
                                <h3 className="mb-2 text-lg font-semibold text-white">
                                    엑셀 파일을 드래그하거나 클릭하여 선택하세요
                                </h3>
                                <p className="mb-4 text-sm text-gray-400">.xlsx, .xls 파일을 지원합니다. 최대 10MB</p>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={(event) => {
                                        const selectedFile = event.target.files?.[0];
                                        if (selectedFile) acceptFile(selectedFile);
                                    }}
                                    className="hidden"
                                    id="file-input"
                                />
                                <label htmlFor="file-input" className="btn-primary inline-block cursor-pointer">
                                    파일 선택
                                </label>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div className="flex flex-col gap-4 rounded-lg bg-gray-700/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h4 className="font-medium text-white">{file.name}</h4>
                                        <p className="text-sm text-gray-400">{formatFileSize(file.size)}</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setFile(null);
                                            resetResult();
                                        }}
                                        className="text-left text-sm text-red-400 hover:text-red-300 sm:text-right"
                                    >
                                        파일 제거
                                    </button>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUploadMode('workbook');
                                            resetResult();
                                        }}
                                        className={`rounded-lg border px-4 py-3 text-left transition-colors ${uploadMode === 'workbook'
                                            ? 'border-blue-400 bg-blue-500/15 text-white'
                                            : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-500'
                                            }`}
                                    >
                                        <span className="block font-semibold">전체 워크북</span>
                                        <span className="mt-1 block text-sm text-gray-400">인식 가능한 모든 워크시트를 한 번에 처리합니다.</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUploadMode('worksheet');
                                            resetResult();
                                        }}
                                        className={`rounded-lg border px-4 py-3 text-left transition-colors ${uploadMode === 'worksheet'
                                            ? 'border-blue-400 bg-blue-500/15 text-white'
                                            : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-500'
                                            }`}
                                    >
                                        <span className="block font-semibold">워크시트 선택</span>
                                        <span className="mt-1 block text-sm text-gray-400">쉼표로 입력한 워크시트만 처리합니다.</span>
                                    </button>
                                </div>

                                {uploadMode === 'worksheet' && (
                                    <div>
                                        <label htmlFor="sheet-names" className="mb-2 block text-sm font-medium text-gray-300">
                                            워크시트 이름
                                        </label>
                                        <input
                                            id="sheet-names"
                                            value={sheetNames}
                                            onChange={(event) => {
                                                setSheetNames(event.target.value);
                                                resetResult();
                                            }}
                                            placeholder="예: 고객요구사항도출표, QFD"
                                            className="input w-full"
                                        />
                                        {availableSheetText && (
                                            <p className="mt-2 text-xs text-gray-500">사용 가능한 시트: {availableSheetText}</p>
                                        )}
                                    </div>
                                )}

                                <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
                                    <p className="mb-3 text-sm font-semibold text-white">시스템 반영 방식</p>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <button
                                            type="button"
                                            onClick={() => setWritePolicy('replace')}
                                            className={`rounded-lg border px-4 py-3 text-left transition-colors ${writePolicy === 'replace'
                                                ? 'border-emerald-400 bg-emerald-500/15 text-white'
                                                : 'border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-500'
                                                }`}
                                        >
                                            <span className="block font-semibold">기존 값 교체</span>
                                            <span className="mt-1 block text-sm text-gray-400">선택한 워크시트에 해당하는 기존 데이터를 새 값으로 바꿉니다.</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setWritePolicy('append')}
                                            className={`rounded-lg border px-4 py-3 text-left transition-colors ${writePolicy === 'append'
                                                ? 'border-emerald-400 bg-emerald-500/15 text-white'
                                                : 'border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-500'
                                                }`}
                                        >
                                            <span className="block font-semibold">기존 값에 추가</span>
                                            <span className="mt-1 block text-sm text-gray-400">현재 프로젝트 데이터 뒤에 엑셀 값을 덧붙입니다.</span>
                                        </button>
                                    </div>
                                </div>

                                {uploadStatus === 'parsing' && (
                                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                                        엑셀 파일을 읽고 워크시트 구조를 분석하는 중입니다.
                                    </div>
                                )}

                                {errorMessage && (
                                    <div className="rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                        {errorMessage}
                                    </div>
                                )}

                                <button
                                    onClick={() => submitImport('preview')}
                                    disabled={isUploading || (uploadMode === 'worksheet' && !sheetNames.trim())}
                                    className="w-full btn-primary py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isUploading ? '분석 중...' : '엑셀 분석'}
                                </button>
                            </div>
                        )}
                    </div>

                    {result && (
                        <div className="space-y-6">
                            <div className="card">
                                <h3 className="mb-4 text-lg font-semibold text-white">분석 요약</h3>
                                <div className="grid gap-3 sm:grid-cols-4">
                                    <div className="rounded-lg bg-gray-800/70 p-4">
                                        <p className="text-xs text-gray-400">전체 시트</p>
                                        <p className="mt-1 text-2xl font-bold text-white">{result.workbook.totalSheets}</p>
                                    </div>
                                    <div className="rounded-lg bg-gray-800/70 p-4">
                                        <p className="text-xs text-gray-400">선택 시트</p>
                                        <p className="mt-1 text-2xl font-bold text-white">{result.sheetsProcessed}</p>
                                    </div>
                                    <div className="rounded-lg bg-gray-800/70 p-4">
                                        <p className="text-xs text-gray-400">인식 시트</p>
                                        <p className="mt-1 text-2xl font-bold text-white">{result.recognizedSheets?.length ?? 0}</p>
                                    </div>
                                    <div className="rounded-lg bg-gray-800/70 p-4">
                                        <p className="text-xs text-gray-400">상태</p>
                                        <p className={`mt-1 text-base font-semibold ${result.applied ? 'text-emerald-300' : 'text-blue-300'}`}>
                                            {result.applied ? '반영 완료' : '분석 완료'}
                                        </p>
                                    </div>
                                </div>

                                {(result.warnings.length > 0 || result.errors.length > 0) && (
                                    <div className="mt-4 space-y-2 text-sm">
                                        {result.errors.map((error) => (
                                            <p key={error} className="text-red-300">{error}</p>
                                        ))}
                                        {result.warnings.slice(0, 8).map((warning) => (
                                            <p key={warning} className="text-yellow-300">{warning}</p>
                                        ))}
                                    </div>
                                )}

                                {result.formulaIssues && result.formulaIssues.length > 0 && (
                                    <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                        깨진 수식이 있어 시스템 반영 전에 수정이 필요합니다:{' '}
                                        {result.formulaIssues.map((issue) => `${issue.sheet}!${issue.cell}`).join(', ')}
                                    </div>
                                )}

                                {positiveCounts.length > 0 && (
                                    <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/70 p-4">
                                        <p className="mb-3 text-sm font-semibold text-white">반영 대상 데이터</p>
                                        <div className="grid gap-2 text-xs text-gray-300 sm:grid-cols-3">
                                            {positiveCounts.map(([key, count]) => (
                                                <div key={key} className="rounded bg-gray-900/70 px-3 py-2">
                                                    <span className="text-gray-500">{COUNT_LABELS[key] ?? key}</span>
                                                    <span className="ml-2 font-semibold text-white">{count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {result.applied ? (
                                    <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                                        엑셀 데이터가 시스템에 반영되었습니다. 프로젝트 화면으로 돌아가 각 워크시트 값을 확인할 수 있습니다.
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => submitImport('apply')}
                                        disabled={isApplying || !file || Boolean(result.formulaIssues?.length)}
                                        className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isApplying ? '시스템 반영 중...' : '분석 결과를 시스템에 반영'}
                                    </button>
                                )}
                            </div>

                            {result.sheetPreviews.map((sheet) => (
                                <div key={sheet.name} className="card">
                                    <div className="mb-4">
                                        <h3 className="text-lg font-semibold text-white">{sheet.name}</h3>
                                        <p className="text-sm text-gray-400">
                                            {sheet.rowCount}행 x {sheet.colCount}열 · 값 {sheet.nonEmptyCellCount}개 · 수식 {sheet.formulaCount}개
                                        </p>
                                    </div>
                                    <div className="overflow-x-auto rounded-lg border border-gray-700">
                                        <table className="min-w-full text-left text-xs">
                                            <tbody>
                                                {sheet.previewRows.map((row, rowIndex) => (
                                                    <tr key={`${sheet.name}-${rowIndex}`} className="border-b border-gray-800 last:border-b-0">
                                                        {row.map((cell, colIndex) => (
                                                            <td
                                                                key={`${sheet.name}-${rowIndex}-${colIndex}`}
                                                                className="max-w-[220px] truncate border-r border-gray-800 px-3 py-2 text-gray-300 last:border-r-0"
                                                            >
                                                                {cell === null || cell === undefined || cell === '' ? '-' : String(cell)}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="card">
                        <h3 className="mb-4 text-lg font-semibold text-white">권장 워크시트</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
                            {RECOMMENDED_SHEETS.map((sheet) => (
                                <button
                                    key={sheet}
                                    type="button"
                                    onClick={() => {
                                        setUploadMode('worksheet');
                                        setSheetNames((current) => {
                                            const names = current.split(',').map((name) => name.trim()).filter(Boolean);
                                            return names.includes(sheet) ? current : [...names, sheet].join(', ');
                                        });
                                        resetResult();
                                    }}
                                    className="rounded bg-gray-700/50 px-3 py-2 text-left text-gray-300 transition-colors hover:bg-gray-700"
                                >
                                    {sheet}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
