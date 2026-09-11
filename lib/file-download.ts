// 브라우저에서 만든 파일을 내려받게 하는 한 가지 방법을 모아 둔다.
//
// 화면마다 a 태그를 만들고 붙였다 떼는 예닐곱 줄을 복붙해 두면, 그중 한 곳만
// 붙이기를 빠뜨려도(또는 주소를 너무 일찍 해제해도) 그 화면에서만 조용히
// 내려받기가 안 된다. 실제로 그런 차이가 화면마다 나 있었다.

/** 누른 직후 바로 해제하면 내려받기가 시작되기 전에 주소가 무효가 될 수 있다. */
const REVOKE_DELAY_MS = 10000;

export function downloadBlobAsFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    // 문서에 붙였다가 눌러야 한다. 붙이지 않은 요소의 click 을 무시하는 브라우저가 있다.
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
