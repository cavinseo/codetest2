// 지연 전달자. 로더 훅은 별도 스레드에서 돌아 메인 스레드의 vi.mock 레지스트리가
// 보이지 않는다 — 그래서 이름 목록은 미리 정해 두고, 값은 **모듈 본문**(메인 스레드)에서
// 실제 접근 시점에 읽는다. 그 시점이면 테스트가 이미 mock 을 등록한 뒤다.
export function forward(key, name) {
    const pick = () => {
        const mocked = globalThis.__viMocks?.get(key);
        if (!mocked || !(name in mocked)) {
            throw new Error(`감리 하네스: ${key} 의 ${name} 은 vi.mock 으로만 쓸 수 있다 — 이 테스트에 mock 이 없다`);
        }
        return mocked[name];
    };
    // 함수·객체 어느 쪽으로 쓰이든 받아 넘긴다.
    return new Proxy(function () {}, {
        get: (_target, property) => pick()[property],
        has: (_target, property) => property in pick(),
        apply: (_target, thisArg, args) => Reflect.apply(pick(), thisArg, args),
        construct: (_target, args) => Reflect.construct(pick(), args),
    });
}
