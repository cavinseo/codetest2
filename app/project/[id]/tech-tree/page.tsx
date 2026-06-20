// WS-10 기능기술체계도 화면을 공통 테이블로 연결하는 페이지입니다.
import TechTreeTable from '@/components/project/TechTreeTable';

interface TechTreePageProps {
    params: Promise<{ id: string }>;
}

export default async function TechTreePage({ params }: TechTreePageProps) {
    const { id } = await params;

    return (
        <main className="min-h-screen bg-surface-900 bg-grid px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1800px]">
                <TechTreeTable projectId={id} />
            </div>
        </main>
    );
}
