// 감리용 모듈 해석 규칙. vitest 없이 이 저장소의 테스트 파일을 그대로 돌리기 위한 것이다.
//
// 세 가지를 한다.
//  1. 'vitest' 를 셰임으로, 설치할 수 없는 패키지 몇 개를 스텁으로 바꾼다.
//  2. 확장자 없는 상대 import 에 .ts/.tsx 를 붙여 준다(번들러가 하던 일).
//  3. vi.mock 이 등록한 팩토리 결과에서 export 이름을 읽어 모듈을 즉석에서 만든다.
//     vitest 는 호이스팅으로 처리하지만 여기서는 그럴 수 없다 — 대신 이 저장소의 테스트가
//     mock 을 등록한 뒤 top-level await 로 대상을 불러오는 덕에, 그 시점의 resolve 에서는
//     레지스트리가 이미 차 있다.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).href;
// tools/supervisor/ 에서 두 단계 위가 저장소 뿌리다.
const REPO = pathToFileURL(path.resolve(new URL('.', import.meta.url).pathname, '../..') + '/').href;

const STATIC = {
    vitest: HERE + 'vitest-shim.mjs',
    'next/server': HERE + 'stubs/next-server.mjs',
    docx: HERE + 'stubs/docx.mjs',
    '@prisma/client': HERE + 'stubs/prisma-client.mjs',
};

// 정적 import 는 vi.mock 보다 먼저 해석된다. 그런 모듈은 지연 프록시로 바꿔 두고
// 실제 접근 시점(테스트 실행 중)에 레지스트리를 읽게 한다.
const LAZY = {
    'lib/prisma': HERE + 'stubs/prisma-lazy.mjs',
    'lib/authorization': HERE + 'stubs/authorization.mjs',
    'lib/logger': HERE + 'stubs/logger.mjs',
};

/** '../lib/prisma' · '@/lib/prisma' · './lib/prisma' 를 같은 열쇠 'lib/prisma' 로 모은다. */
function mockKey(specifier) {
    const matched = String(specifier).match(/(?:^|\/)((?:lib|app|components)\/[^?]*)$/);
    return matched ? matched[1].replace(/\.[cm]?[jt]sx?$/, '') : null;
}

async function withTsExtension(specifier, context, nextResolve) {
    try {
        return await nextResolve(specifier, context);
    } catch (error) {
        if (!/\.[cm]?[jt]sx?$/.test(specifier)) {
            for (const extension of ['.ts', '.tsx']) {
                try {
                    return await nextResolve(specifier + extension, context);
                } catch {
                    // 다음 확장자를 본다.
                }
            }
        }
        throw error;
    }
}

export async function resolve(specifier, context, nextResolve) {
    if (STATIC[specifier]) return { url: STATIC[specifier], shortCircuit: true };

    const key = mockKey(specifier);
    if (key && LAZY[key]) return { url: LAZY[key], shortCircuit: true };

    const mocks = globalThis.__viMocks;
    if (mocks && key && mocks.has(key)) {
        const mocked = mocks.get(key) ?? {};
        const names = Object.keys(mocked).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default');
        let source = `const m = globalThis.__viMocks.get(${JSON.stringify(key)});\n`;
        for (const name of names) source += `export const ${name} = m[${JSON.stringify(name)}];\n`;
        if ('default' in mocked) source += 'export default m["default"];\n';
        return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
    }

    if (specifier.startsWith('@/')) return withTsExtension(REPO + specifier.slice(2), context, nextResolve);
    if (specifier.startsWith('.')) return withTsExtension(specifier, context, nextResolve);

    try {
        return await nextResolve(specifier, context);
    } catch (error) {
        // node_modules 가 없는 감리 컨테이너에서는 전역 설치분으로 떨어진다(playwright 등).
        // 사용자 로컬처럼 node_modules 가 있으면 위에서 이미 풀렸으므로 여기 오지 않는다.
        const globalRoot = process.env.SUPERVISOR_GLOBAL_MODULES ?? '/opt/node22/lib/node_modules';
        const candidate = path.join(globalRoot, specifier);
        if (fs.existsSync(candidate)) {
            // 디렉터리를 그대로 넘기면 ESM 이 거부한다 — package.json 의 진입점을 직접 읽는다.
            const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8'));
            const entry = manifest.exports?.['.']?.import?.default
                ?? manifest.exports?.['.']?.import
                ?? manifest.module
                ?? manifest.main
                ?? 'index.js';
            return { url: pathToFileURL(path.join(candidate, entry)).href, shortCircuit: true };
        }
        throw error;
    }
}
