// WS-11 개선포인트도출 화면을 공통 테이블로 연결하는 페이지입니다.
import ImprovementsTable from '@/components/project/ImprovementsTable';
import StandaloneWorksheetPage, { type StandaloneWorksheetPageProps } from '@/components/project/StandaloneWorksheetPage';

export default async function ImprovementsPage({ params }: StandaloneWorksheetPageProps) {
    const { id } = await params;

    return (
        <StandaloneWorksheetPage projectId={id}>
            <ImprovementsTable projectId={id} />
        </StandaloneWorksheetPage>
    );
}
