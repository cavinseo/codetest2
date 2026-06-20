'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import ProductAttributesTable from '@/components/project/ProductAttributesTable';

export default function AttributesPage() {
    const params = useParams();
    const projectId = params.id as string;

    return (
        <div className="min-h-screen bg-gray-900">
            {/* 헤더 */}
            <header className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Link
                                href={`/project/${projectId}`}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                ← 프로젝트로 돌아가기
                            </Link>
                            <div className="h-6 w-px bg-gray-700" />
                            <div>
                                <h1 className="text-2xl font-bold text-white">📋 [WS-3] 제품속성서</h1>
                                <p className="text-sm text-gray-400 mt-1">
                                    세분시장별 고객 니즈와 제공 혜택, 제품속성 및 기술역량을 정의합니다
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <ProductAttributesTable projectId={projectId} />
            </main>
        </div>
    );
}
