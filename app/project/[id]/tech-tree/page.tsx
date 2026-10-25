// WS-10 기능기술체계도 화면을 공통 테이블로 연결하는 페이지입니다.
import TechTreeTable from '@/components/project/TechTreeTable';
import StandaloneWorksheetPage, { type StandaloneWorksheetPageProps } from '@/components/project/StandaloneWorksheetPage';

export default async function TechTreePage({ params }: StandaloneWorksheetPageProps) {
    const { id } = await params;

    return (
        <StandaloneWorksheetPage projectId={id}>
            <TechTreeTable projectId={id} />
        </StandaloneWorksheetPage>
    );
}
