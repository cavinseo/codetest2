// 워크시트 조회 실패를 안내하고 저장 대신 재시도를 제공한다.
export default function WorksheetLoadError({ onRetry }: { onRetry: () => void }) {
    return (
        <div role="alert" className="card space-y-3 text-sm">
            <p>데이터를 불러오지 못했습니다. 다시 불러온 후 편집해 주세요.</p>
            <button type="button" onClick={onRetry} className="btn-secondary text-sm">다시 불러오기</button>
        </div>
    );
}
