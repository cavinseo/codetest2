// 회귀 그물 역검증. 소스에 변경을 하나씩 주입하고 테스트가 그걸 잡는지 본다.
//
//   node tools/supervisor/mutate.mjs <뮤턴트 정의 .json|.mjs>
//
// 정의 파일은 이런 모양이다(.mjs 면 default export, .json 이면 그대로):
//   {
//     "source": "app/api/.../route.ts",
//     "tests": ["tests/api-....test.ts"],
//     "mutants": [
//       { "name": "만료를 1분 뒤로", "from": "(now) => now,", "to": "(now) => new Date(+now + 60000)," }
//     ]
//   }
//
// 살아남은 뮤턴트는 "그 동작을 지키는 테스트가 없다"는 뜻이다. 게이트가 초록이어도
// 그 자리는 다음 리팩터에 조용히 깨진다 — 감리 판정에서 이것을 근거로 쓴다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

const specPath = process.argv[2];
if (!specPath) {
    console.error('뮤턴트 정의 파일 경로가 필요하다');
    process.exit(2);
}
const resolved = path.resolve(specPath);
const spec = resolved.endsWith('.json')
    ? JSON.parse(fs.readFileSync(resolved, 'utf8'))
    : (await import(pathToFileURL(resolved).href)).default;

const sourceFile = path.resolve(REPO, spec.source);
const original = fs.readFileSync(sourceFile, 'utf8');

function runTests() {
    let pass = 0;
    let total = 0;
    let fail = 0;
    for (const test of spec.tests) {
        const result = spawnSync('node', [
            '--experimental-strip-types', '--no-warnings',
            '--import', path.join(HERE, 'hook.mjs'),
            path.join(HERE, 'run-test-file.mjs'),
            path.resolve(REPO, test),
        ], { cwd: REPO, encoding: 'utf8', timeout: 120_000 });
        const summary = ((result.stdout ?? '') + (result.stderr ?? '')).match(/(\d+)\/(\d+) 통과, (\d+) 실패/);
        if (!summary) return null;
        pass += +summary[1];
        total += +summary[2];
        fail += +summary[3];
    }
    return { pass, total, fail };
}

const baseline = runTests();
if (!baseline) {
    console.error('기준선을 잡지 못했다 — 테스트가 셰임에서 돌지 않는다');
    process.exit(2);
}
if (baseline.fail > 0) {
    console.error(`기준선이 이미 빨갛다(${baseline.pass}/${baseline.total}) — 먼저 그것부터 본다`);
    process.exit(2);
}
console.log(`기준선 ${baseline.pass}/${baseline.total} 통과\n`);

const survivors = [];
try {
    for (const mutant of spec.mutants) {
        const occurrences = original.split(mutant.from).length - 1;
        if (occurrences !== 1) {
            console.log(`  ?  ${mutant.name} — from 이 ${occurrences}번 일치해 건너뛴다`);
            continue;
        }
        fs.writeFileSync(sourceFile, original.replace(mutant.from, mutant.to), 'utf8');
        const result = runTests();
        const killed = result === null || result.fail > 0;
        if (!killed) survivors.push(mutant.name);
        const detail = result === null ? '실행 불가(= 잡힘으로 셈한다)' : `${result.pass}/${result.total}`;
        console.log(`  ${killed ? '죽음' : '생존'}  ${mutant.name}  ${detail}`);
    }
} finally {
    fs.writeFileSync(sourceFile, original, 'utf8');
}

const restored = fs.readFileSync(sourceFile, 'utf8') === original;
console.log(`\n원복 ${restored ? '확인' : '실패 — 손으로 되돌려라'}`);
console.log(survivors.length === 0
    ? `뮤턴트 ${spec.mutants.length}종 전부 사망 — 이 동작들은 테스트가 지킨다`
    : `생존 ${survivors.length}종: ${survivors.join(', ')}`);
process.exit(restored ? 0 : 1);
