'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ImportPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'parsing' | 'mapping' | 'saving' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [migrationResult, setMigrationResult] = useState<any>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.name.endsWith('.xlsx')) {
            setFile(droppedFile);
            setErrorMessage('');
        } else {
            setErrorMessage('.xlsx 파일만 업로드할 수 있습니다.');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (selectedFile.name.endsWith('.xlsx')) {
                setFile(selectedFile);
                setErrorMessage('');
            } else {
                setErrorMessage('.xlsx 파일만 업로드할 수 있습니다.');
            }
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setIsUploading(true);
        setUploadStatus('parsing');
        setUploadProgress(10);
        setErrorMessage('');

        try {
            // FormData 생성
            const formData = new FormData();
            formData.append('file', file);

            setUploadProgress(30);
            setUploadStatus('mapping');

            // 업로드 API 호출
            const response = await fetch(`/api/projects/${projectId}/import`, {
                method: 'POST',
                body: formData,
            });

            setUploadProgress(70);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '파일 업로드 실패');
            }

            setUploadProgress(90);
            setUploadStatus('saving');

            // 짧은 딜레이 후 완료
            setTimeout(() => {
                setUploadProgress(100);
                setUploadStatus('success');
                setMigrationResult(data);
            }, 500);
        } catch (error: any) {
            setUploadStatus('error');
            setErrorMessage(error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getStatusMessage = () => {
        switch (uploadStatus) {
            case 'parsing':
                return '📄 엑셀 파일 분석 중...';
            case 'mapping':
                return '🔄 데이터 매핑 중...';
            case 'saving':
                return '💾 데이터베이스 저장 중...';
            case 'success':
                return '✅ 마이그레이션 완료!';
            case 'error':
                return '❌ 마이그레이션 실패';
            default:
                return '';
        }
    };

    return (
        <div className="min-h-screen bg-gray-900">
            {/* 헤더 */}
            <header className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center space-x-4">
                        <Link
                            href={`/project/${projectId}`}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            ← 프로젝트로 돌아가기
                        </Link>
                        <div className="h-6 w-px bg-gray-700" />
                        <div>
                            <h1 className="text-2xl font-bold text-white">엑셀 파일 가져오기</h1>
                            <p className="text-sm text-gray-400 mt-1">
                                기존 엑셀 데이터를 자동으로 가져옵니다
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            {/* 메인 콘텐츠 */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="space-y-6">
                    {/* 안내 메시지 */}
                    <div className="card bg-blue-500/10 border border-blue-500/30">
                        <h3 className="font-semibold text-white mb-2">📝 마이그레이션 안내</h3>
                        <ul className="text-sm text-gray-300 space-y-1">
                            <li>• 17개 시트 구조의 Kano & QFD 엑셀 파일을 지원합니다</li>
                            <li>• 고객요구사항도출표 데이터가 자동으로 추출됩니다</li>
                            <li>• 파일 크기는 최대 10MB까지 지원합니다</li>
                            <li>• 수식은 자동으로 재계산되어 저장됩니다</li>
                        </ul>
                    </div>

                    {/* 업로드 영역 */}
                    <div className="card">
                        <h2 className="text-xl font-bold text-white mb-6">파일 선택</h2>

                        {!file ? (
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`
                  border-2 border-dashed rounded-lg p-12 text-center transition-all
                  ${isDragging
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-gray-600 hover:border-blue-500 hover:bg-gray-800/50'
                                    }
                  cursor-pointer
                `}
                            >
                                <div className="text-6xl mb-4">📄</div>
                                <h3 className="text-lg font-semibold text-white mb-2">
                                    엑셀 파일을 드래그하거나 클릭하여 선택하세요
                                </h3>
                                <p className="text-sm text-gray-400 mb-4">
                                    .xlsx 파일을 지원합니다 (최대 10MB)
                                </p>
                                <input
                                    type="file"
                                    accept=".xlsx"
                                    onChange={handleFileChange}
                                    className="hidden"
                                    id="file-input"
                                />
                                <label htmlFor="file-input" className="btn-primary cursor-pointer inline-block">
                                    파일 선택
                                </label>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* 선택된 파일 정보 */}
                                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                                    <div className="flex items-center space-x-4">
                                        <div className="text-4xl">📊</div>
                                        <div>
                                            <h4 className="font-medium text-white">{file.name}</h4>
                                            <p className="text-sm text-gray-400">
                                                {formatFileSize(file.size)}
                                            </p>
                                        </div>
                                    </div>
                                    {uploadStatus !== 'success' && (
                                        <button
                                            onClick={() => {
                                                setFile(null);
                                                setUploadStatus('idle');
                                                setUploadProgress(0);
                                                setErrorMessage('');
                                            }}
                                            className="text-red-400 hover:text-red-300"
                                        >
                                            🗑️ 제거
                                        </button>
                                    )}
                                </div>

                                {/* 진행 상태 */}
                                {isUploading && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-300">{getStatusMessage()}</span>
                                            <span className="text-blue-400 font-semibold">
                                                {uploadProgress}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-700 rounded-full h-2">
                                            <div
                                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* 성공 메시지 */}
                                {uploadStatus === 'success' && migrationResult && (
                                    <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
                                        <h4 className="font-semibold text-green-300 mb-2">
                                            ✅ 마이그레이션 성공!
                                        </h4>
                                        <div className="text-sm text-gray-300 space-y-1">
                                            <p>• 고객 요구사항: {migrationResult.requirementCount || 0}개</p>
                                            <p>• 처리된 시트: {migrationResult.sheetsProcessed || 0}개</p>
                                            {migrationResult.warnings?.length > 0 && (
                                                <p className="text-yellow-400">
                                                    ⚠️ 경고: {migrationResult.warnings.length}개
                                                </p>
                                            )}
                                        </div>
                                        <div className="mt-4">
                                            <Link
                                                href={`/project/${projectId}`}
                                                className="btn-primary inline-block"
                                            >
                                                프로젝트로 이동
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                {/* 에러 메시지 */}
                                {errorMessage && (
                                    <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
                                        {errorMessage}
                                    </div>
                                )}

                                {/* 업로드 버튼 */}
                                {uploadStatus !== 'success' && (
                                    <button
                                        onClick={handleUpload}
                                        disabled={isUploading}
                                        className="w-full btn-primary py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isUploading ? '처리 중...' : '마이그레이션 시작'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 지원 시트 목록 */}
                    <div className="card">
                        <h3 className="text-lg font-semibold text-white mb-4">
                            지원하는 시트 (17개)
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                            {[
                                '고객요구사항도출표',
                                'KANO질문지',
                                'QFD',
                                '자사매출추정표',
                                '경쟁사매출추정표',
                                '결과',
                                'Kano_분석결과',
                                '고객요구사항_우선순위',
                                'Kano_4분면',
                                '기술특성',
                                'WHATs-HOWs관계',
                                '기술중요도',
                                '경쟁사벤치마킹',
                                '목표값설정',
                                '기술특성_우선순위',
                                '기술특성_상관관계',
                                '최종결과',
                            ].map((sheet) => (
                                <div
                                    key={sheet}
                                    className="px-3 py-2 bg-gray-700/50 rounded text-gray-300"
                                >
                                    ✓ {sheet}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
