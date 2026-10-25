// WS-14 핵심자산 및 보완자산 도출표 화면을 공통 테이블로 연결하는 페이지입니다.
import AssetsTable from '@/components/project/AssetsTable';
import StandaloneWorksheetPage, { type StandaloneWorksheetPageProps } from '@/components/project/StandaloneWorksheetPage';

export default async function AssetsPage({ params }: StandaloneWorksheetPageProps) {
    const { id } = await params;

    return (
        <StandaloneWorksheetPage projectId={id}>
            <AssetsTable projectId={id} />
        </StandaloneWorksheetPage>
    );
}
