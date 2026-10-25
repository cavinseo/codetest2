// WS-1 자사매출추정표 화면을 공통 테이블로 연결하는 페이지입니다.
import SalesTable from '@/components/project/SalesTable';
import StandaloneWorksheetPage, { type StandaloneWorksheetPageProps } from '@/components/project/StandaloneWorksheetPage';

export default async function SalesPage({ params }: StandaloneWorksheetPageProps) {
    const { id } = await params;

    return (
        <StandaloneWorksheetPage projectId={id}>
            <SalesTable projectId={id} />
        </StandaloneWorksheetPage>
    );
}
