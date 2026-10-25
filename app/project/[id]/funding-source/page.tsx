// WS-16 자금조달계획표 화면을 공통 테이블로 연결하는 페이지입니다.
import FundingTable from '@/components/project/FundingTable';
import StandaloneWorksheetPage, { type StandaloneWorksheetPageProps } from '@/components/project/StandaloneWorksheetPage';

export default async function FundingSourcePage({ params }: StandaloneWorksheetPageProps) {
    const { id } = await params;

    return (
        <StandaloneWorksheetPage projectId={id}>
            <FundingTable projectId={id} mode="source" />
        </StandaloneWorksheetPage>
    );
}
