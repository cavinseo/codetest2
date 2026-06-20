// WS-17 자금조달계획표 화면을 공통 테이블로 연결하는 페이지입니다.
import FundingTable from '@/components/project/FundingTable';

interface FundingSourcePageProps {
    params: Promise<{ id: string }>;
}

export default async function FundingSourcePage({ params }: FundingSourcePageProps) {
    const { id } = await params;

    return (
        <main className="min-h-screen bg-surface-900 bg-grid px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1800px]">
                <FundingTable projectId={id} mode="source" />
            </div>
        </main>
    );
}
