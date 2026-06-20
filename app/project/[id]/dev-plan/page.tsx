// WS-14 개발계획서 화면을 공통 테이블로 연결하는 페이지입니다.
import DevPlanTable from '@/components/project/DevPlanTable';

interface DevPlanPageProps {
    params: Promise<{ id: string }>;
}

export default async function DevPlanPage({ params }: DevPlanPageProps) {
    const { id } = await params;

    return (
        <main className="min-h-screen bg-surface-900 bg-grid px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1800px]">
                <DevPlanTable projectId={id} />
            </div>
        </main>
    );
}
