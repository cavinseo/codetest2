// 테스트 파일 하나를 vitest 없이 돌린다.
//   node --experimental-strip-types --import ./tools/supervisor/hook.mjs \
//        ./tools/supervisor/run-test-file.mjs tests/<이름>.test.ts
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.argv[2];
if (!target) {
    console.error('테스트 파일 경로가 필요하다');
    process.exit(2);
}
await import(pathToFileURL(path.resolve(target)).href);
const { report } = await import('vitest');
process.exit((await report()) > 0 ? 1 : 0);
