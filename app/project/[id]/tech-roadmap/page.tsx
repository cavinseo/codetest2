// WS-13 향후목표고객LIST 화면을 공통 테이블로 연결하는 페이지입니다.
import TechRoadmapTable from '@/components/project/TechRoadmapTable';
import StandaloneWorksheetPage, { type StandaloneWorksheetPageProps } from '@/components/project/StandaloneWorksheetPage';

export default async function TechRoadmapPage({ params }: StandaloneWorksheetPageProps) {
    const { id } = await params;

    return (
        <StandaloneWorksheetPage projectId={id}>
            <TechRoadmapTable projectId={id} />
        </StandaloneWorksheetPage>
    );
}
