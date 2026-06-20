// WS-15 핵심자산 및 보완자산 도출표 화면을 공통 테이블로 연결하는 페이지입니다.
import AssetsTable from '@/components/project/AssetsTable';

interface AssetsPageProps {
    params: Promise<{ id: string }>;
}

export default async function AssetsPage({ params }: AssetsPageProps) {
    const { id } = await params;

    return (
        <main className="min-h-screen bg-surface-900 bg-grid px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1800px]">
                <AssetsTable projectId={id} />
            </div>
        </main>
    );
}
