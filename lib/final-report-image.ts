// 보고서에 저장할 사진과 캡처를 화면 비율을 유지하며 압축한다.
export async function optimizeReportImage(source: File | string): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
    if (source instanceof File && source.size > 20_000_000) {
        throw new Error('제품 이미지는 20MB 이하의 파일을 선택해 주세요.');
    }
    const objectUrl = source instanceof File ? URL.createObjectURL(source) : null;
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('이미지를 읽지 못했습니다. PNG 또는 JPEG 파일로 다시 선택해 주세요.'));
            element.src = objectUrl ?? source as string;
        });
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (!width || !height) throw new Error('이미지 크기를 확인하지 못했습니다. 다른 파일을 선택해 주세요.');
        const scale = Math.min(1, 2000 / width, 8000 / height, Math.sqrt(8_000_000 / (width * height)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(width * scale));
        canvas.height = Math.max(1, Math.floor(height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('이미지를 최적화하지 못했습니다. 브라우저를 새로 열어 주세요.');
        // JPEG에서 투명 영역이 검게 변하지 않도록 인쇄면과 같은 흰색으로 채운다.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const png = canvas.toDataURL('image/png');
        const jpeg = canvas.toDataURL('image/jpeg', 0.85);
        if (png === 'data:,' || jpeg === 'data:,') throw new Error('이미지 크기가 너무 큽니다. 더 작은 파일을 선택해 주세요.');
        return { dataUrl: jpeg.length < png.length ? jpeg : png, widthPx: canvas.width, heightPx: canvas.height };
    } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
}
