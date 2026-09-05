// lib/prisma 자리. 정적 import 는 vi.mock 보다 먼저 해석되므로 값을 지금 정할 수 없다.
// 대신 프록시를 내보내고 실제 접근 시점(테스트 실행 중, mock 등록 후)에 레지스트리를 읽는다.
const target = () => globalThis.__viMocks?.get('lib/prisma')?.prisma ?? {};
export const prisma = new Proxy(function () {}, {
    get: (_t, key) => target()[key],
    has: (_t, key) => key in target(),
    apply: (_t, thisArg, args) => target().apply(thisArg, args),
});
export default prisma;
