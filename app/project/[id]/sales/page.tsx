// WS-1 자사매출추정표 화면을 공통 테이블로 연결하는 페이지입니다.
import SalesTable from '@/components/project/SalesTable';

interface SalesPageProps {
    params: Promise<{ id: string }>;
}

export default async function SalesPage({ params }: SalesPageProps) {
    const { id } = await params;

    return (
        <main className="min-h-screen bg-surface-900 bg-grid px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1800px]">
                <SalesTable projectId={id} />
            </div>
        </main>
    );
}
