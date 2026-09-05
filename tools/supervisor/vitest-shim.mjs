// vitest 를 설치할 수 없는 컨테이너에서 워커의 실제 테스트 파일을 그대로 실행하기
// 위한 최소 셰임. 내 하네스가 아니라 워커가 커밋한 테스트가 결함을 잡는지 확인하는
// 역검증용이라, 매처는 이 저장소의 테스트가 쓰는 것만 구현한다. async it 을 지원해야
// Task 2 의 렌더러 테스트(Packer.toBuffer 가 Promise)를 돌릴 수 있다.
import assert from 'node:assert/strict';

const results = [];
// 직렬 큐. beforeEach 로 공유 mock 을 초기화하는 테스트가 있으므로 동시 실행하면
// 서로의 상태를 밟는다 — vitest 의 파일 내 기본 동작(직렬)에 맞춘다.
let chain = Promise.resolve();
const pending = { push: (make) => { chain = chain.then(make); } };
let suite = '';

export function describe(name, fn) {
    const outer = suite;
    suite = outer ? `${outer} > ${name}` : name;
    fn();
    suite = outer;
}

// 표 이름의 %s/%i/%d/%j/%p 를 인자로 채운다. describe.each 와 it.each 가 함께 쓴다.
function fillTitle(name, args) {
    let i = 0;
    return String(name).replace(/%[sidjp]/g, () => {
        const value = args[i];
        i += 1;
        return typeof value === 'string' ? value : JSON.stringify(value);
    });
}

describe.each = (rows) => (name, fn) => {
    for (const row of rows) {
        const args = Array.isArray(row) ? row : [row];
        describe(fillTitle(name, args), () => fn(...args));
    }
};

// beforeEach/afterEach — 이 저장소의 라우트 테스트가 mock 초기화에 쓴다. it 이 즉시
// 스케줄되는 셰임 구조라, 등록 시점의 훅 목록을 그 it 에 묶어 순서를 지킨다.
let beforeHooks = [];
let afterHooks = [];

export function beforeEach(fn) {
    beforeHooks = [...beforeHooks, fn];
}

export function afterEach(fn) {
    afterHooks = [...afterHooks, fn];
}

export function it(name, fn) {
    const full = suite ? `${suite} > ${name}` : name;
    const before = beforeHooks;
    const after = afterHooks;
    pending.push(() => (async () => {
        for (const hook of before) await hook();
        try {
            return await fn();
        } finally {
            for (const hook of after) await hook();
        }
    })().then(
        () => results.push({ name: full, ok: true }),
        (error) => results.push({
            name: full,
            ok: false,
            message: String(error?.message ?? error).split('\n').slice(0, 4).join(' | '),
        }),
    ));
}

// it.each(표) — 이 저장소 테스트가 표 기반 케이스를 쓴다.
it.each = (rows) => (name, fn) => {
    for (const row of rows) {
        const args = Array.isArray(row) ? row : [row];
        it(fillTitle(name, args), () => fn(...args));
    }
};

// expect.any / expect.objectContaining 을 위한 비대칭 매처. 값 자리에 놓이면
// deepEqual 이 아니라 자기 술어로 판정한다.
const ASYMMETRIC = Symbol('asymmetric');
const isAsymmetric = (v) => Boolean(v && typeof v === 'object' && v[ASYMMETRIC]);

function deepEqual(a, b) {
    if (isAsymmetric(b)) return b.test(a);
    if (isAsymmetric(a)) return a.test(b);
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const ka = Object.keys(a);
        const kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        return kb.every((k) => k in a && deepEqual(a[k], b[k]));
    }
    try {
        assert.deepEqual(a, b);
        return true;
    } catch {
        return false;
    }
}

// toMatchObject: 기대 객체의 키만 재귀 비교한다(실제 쪽에 남는 키는 허용).
function matchObject(actual, expected) {
    if (isAsymmetric(expected)) return expected.test(actual);
    if (Array.isArray(expected)) {
        return Array.isArray(actual)
            && actual.length === expected.length
            && expected.every((item, i) => matchObject(actual[i], item));
    }
    if (expected && typeof expected === 'object') {
        if (!actual || typeof actual !== 'object') return false;
        return Object.keys(expected).every((k) => matchObject(actual[k], expected[k]));
    }
    return Object.is(actual, expected);
}

function matchers(actual, negated) {
    const ok = (condition, message) => {
        if (negated ? condition : !condition) {
            const shown = Buffer.isBuffer(actual) ? `<Buffer ${actual.length}b>` : JSON.stringify(actual);
            throw new Error(`${negated ? 'not.' : ''}${message} — actual=${shown}`);
        }
    };
    return {
        toBe: (expected) => ok(Object.is(actual, expected), `toBe(${JSON.stringify(expected)})`),
        toEqual: (expected) => ok(deepEqual(actual, expected), `toEqual(${JSON.stringify(expected)})`),
        toMatchObject: (expected) => ok(matchObject(actual, expected), `toMatchObject(${JSON.stringify(expected)})`),
        toStrictEqual: (expected) => ok(deepEqual(actual, expected), `toStrictEqual(${JSON.stringify(expected)})`),
        toMatch: (re) => ok(re.test(actual), `toMatch(${re})`),
        toContain: (needle) => ok(
            Array.isArray(actual) ? actual.includes(needle) : String(actual).includes(needle),
            `toContain(${JSON.stringify(needle)})`,
        ),
        toContainEqual: (needle) => ok(
            Array.isArray(actual) && actual.some((item) => deepEqual(item, needle)),
            `toContainEqual(${JSON.stringify(needle)})`,
        ),
        toBeGreaterThan: (n) => ok(actual > n, `toBeGreaterThan(${n})`),
        toBeGreaterThanOrEqual: (n) => ok(actual >= n, `toBeGreaterThanOrEqual(${n})`),
        toBeLessThan: (n) => ok(actual < n, `toBeLessThan(${n})`),
        toBeLessThanOrEqual: (n) => ok(actual <= n, `toBeLessThanOrEqual(${n})`),
        toBeCloseTo: (n, digits = 2) => ok(Math.abs(actual - n) < Math.pow(10, -digits) / 2, `toBeCloseTo(${n}, ${digits})`),
        toBeNaN: () => ok(Number.isNaN(actual), 'toBeNaN()'),
        toHaveProperty: (key, value) => {
            const parts = String(key).split('.');
            let cursor = actual;
            let found = true;
            for (const part of parts) {
                if (cursor === null || cursor === undefined || !(part in Object(cursor))) { found = false; break; }
                cursor = cursor[part];
            }
            ok(found && (value === undefined || deepEqual(cursor, value)), `toHaveProperty(${JSON.stringify(key)})`);
        },
        toThrow: (expected) => {
            let threw = null;
            try { actual(); } catch (error) { threw = error; }
            const matches = threw !== null && (expected === undefined
                || (expected instanceof RegExp ? expected.test(String(threw?.message ?? threw))
                    : typeof expected === 'string' ? String(threw?.message ?? threw).includes(expected)
                        : threw instanceof expected));
            ok(matches, `toThrow(${expected ?? ''}) — 실제 ${threw ? String(threw.message ?? threw) : '던지지 않음'}`);
        },
        toBeTruthy: () => ok(Boolean(actual), 'toBeTruthy()'),
        toBeFalsy: () => ok(!actual, 'toBeFalsy()'),
        toBeDefined: () => ok(actual !== undefined, 'toBeDefined()'),
        toBeUndefined: () => ok(actual === undefined, 'toBeUndefined()'),
        toBeNull: () => ok(actual === null, 'toBeNull()'),
        toHaveLength: (n) => ok(actual?.length === n, `toHaveLength(${n})`),
        toBeInstanceOf: (cls) => ok(actual instanceof cls, `toBeInstanceOf(${cls?.name})`),
        toBeTypeOf: (type) => ok(typeof actual === type, `toBeTypeOf(${type}) — actual typeof ${typeof actual}`),
        toHaveBeenCalled: () => ok((actual?.mock?.calls?.length ?? 0) > 0, 'toHaveBeenCalled()'),
        toHaveBeenCalledTimes: (n) => ok(actual?.mock?.calls?.length === n, `toHaveBeenCalledTimes(${n})`),
        toHaveBeenCalledOnce: () => ok(actual?.mock?.calls?.length === 1, `toHaveBeenCalledOnce() — 실제 ${actual?.mock?.calls?.length}회`),
        toHaveBeenCalledWith: (...expected) => ok(
            (actual?.mock?.calls ?? []).some((call) => deepEqual(call, expected)),
            `toHaveBeenCalledWith(${JSON.stringify(expected)}) — 기록된 호출 ${JSON.stringify(actual?.mock?.calls)}`,
        ),
    };
}

// .resolves / .rejects — 프라미스를 풀어 같은 매처를 건다. 각 매처가 프라미스를
// 돌려주므로 테스트는 await 해야 하고, 이 저장소 테스트는 실제로 await 한다.
function asyncMatchers(promise, wantRejection) {
    const settle = async () => {
        try {
            const value = await promise;
            if (wantRejection) throw new Error('rejects 를 기대했는데 이행됐다');
            return value;
        } catch (error) {
            if (!wantRejection) throw error;
            return error;
        }
    };
    return new Proxy({}, {
        get: (_target, name) => (...args) => settle().then((value) => matchers(value, false)[name](...args)),
    });
}

export function expect(actual) {
    return {
        ...matchers(actual, false),
        not: matchers(actual, true),
        resolves: asyncMatchers(actual, false),
        rejects: asyncMatchers(actual, true),
    };
}

expect.any = (constructor) => ({
    [ASYMMETRIC]: true,
    test: (value) => (constructor === String ? typeof value === 'string'
        : constructor === Number ? typeof value === 'number'
        : constructor === Boolean ? typeof value === 'boolean'
        : value instanceof constructor),
    toJSON: () => `any(${constructor?.name})`,
});

expect.objectContaining = (expected) => ({
    [ASYMMETRIC]: true,
    test: (value) => matchObject(value, expected),
    toJSON: () => ({ objectContaining: expected }),
});

expect.arrayContaining = (expected) => ({
    [ASYMMETRIC]: true,
    test: (value) => Array.isArray(value) && expected.every((e) => value.some((v) => deepEqual(v, e))),
    toJSON: () => ({ arrayContaining: expected }),
});

expect.stringContaining = (needle) => ({
    [ASYMMETRIC]: true,
    test: (value) => typeof value === 'string' && value.includes(needle),
    toJSON: () => ({ stringContaining: needle }),
});

// vi 의 최소 대체. doMock/resetModules 는 ESM 캐시를 되돌릴 수 없어 no-op 이고,
// 그 위에 선 테스트는 실행할 수 없다 — 하네스가 그 사실을 그대로 보고한다.
const createdMocks = [];
const stubbedEnv = new Map();

export const vi = {
    fn(impl) {
        const calls = [];
        let behavior = impl;
        // 일반 함수여야 한다 — Array.prototype.sort 를 spyOn 하면 this 로 배열이 온다.
        const spy = function (...args) {
            calls.push(args);
            return behavior ? behavior.apply(this, args) : undefined;
        };
        spy.mock = { calls };
        spy.mockReturnValue = (value) => { behavior = () => value; return spy; };
        spy.mockImplementation = (fn) => { behavior = fn; return spy; };
        spy.mockResolvedValue = (value) => { behavior = () => Promise.resolve(value); return spy; };
        spy.mockRejectedValue = (value) => { behavior = () => Promise.reject(value); return spy; };
        spy.mockClear = () => { calls.length = 0; return spy; };
        spy.mockReset = () => { calls.length = 0; behavior = undefined; return spy; };
        spy.__isMock = true;
        createdMocks.push(spy);
        return spy;
    },
    spyOn(object, key) {
        const original = object[key];
        const spy = vi.fn(function (...args) { return original.apply(this, args); });
        spy.mockRestore = () => { object[key] = original; };
        object[key] = spy;
        return spy;
    },
    // vi.mock 은 vitest 에서 호이스팅되지만, 여기서는 테스트가 라우트를 top-level await
    // 로 뒤에 import 하는 덕에 등록만 해 두면 된다. 로더 훅이 이 레지스트리를 읽는다.
    mock(specifier, factory) {
        const key = String(specifier).replace(/^.*?(lib\/[\w-]+)$/, '$1');
        globalThis.__viMocks = globalThis.__viMocks ?? new Map();
        globalThis.__viMocks.set(key, factory());
    },
    // stubEnv — 이 저장소의 암호화 테스트가 키를 이렇게 넣는다.
    stubEnv(key, value) {
        stubbedEnv.set(key, key in process.env ? process.env[key] : undefined);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    },
    unstubAllEnvs() {
        for (const [key, previous] of stubbedEnv) {
            if (previous === undefined) delete process.env[key];
            else process.env[key] = previous;
        }
        stubbedEnv.clear();
    },
    resetModules() {},
    doMock() {},
    doUnmock() {},
    clearAllMocks() { for (const spy of createdMocks) spy.mockClear(); },
    restoreAllMocks() { for (const spy of createdMocks) spy.mockRestore?.(); },
};

export async function report() {
    await chain;
    const failed = results.filter((r) => !r.ok);
    for (const r of failed) console.log(`  FAIL ${r.name}\n       ${r.message}`);
    console.log(`\n${results.length - failed.length}/${results.length} 통과, ${failed.length} 실패`);
    return failed.length;
}
