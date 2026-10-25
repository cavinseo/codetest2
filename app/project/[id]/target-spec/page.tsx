// WS-12 최종목표스펙도출 화면을 공통 테이블로 연결하는 페이지입니다.
import TargetSpecTable from '@/components/project/TargetSpecTable';
import StandaloneWorksheetPage, { type StandaloneWorksheetPageProps } from '@/components/project/StandaloneWorksheetPage';

export default async function TargetSpecPage({ params }: StandaloneWorksheetPageProps) {
    const { id } = await params;

    return (
        <StandaloneWorksheetPage projectId={id}>
            <TargetSpecTable projectId={id} />
        </StandaloneWorksheetPage>
    );
}
