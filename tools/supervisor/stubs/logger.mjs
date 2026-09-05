// lib/logger 자리. mock 이 없으면 조용한 로거로 둔다 — 로그는 판정 대상이 아닌 때가 많고,
// 여기서 던지면 로그를 검사하지 않는 테스트까지 못 돌게 된다.
export function createLogger(module) {
    const mocked = globalThis.__viMocks?.get('lib/logger');
    if (mocked?.createLogger) return mocked.createLogger(module);
    return { info() {}, warn() {}, error() {}, debug() {} };
}
