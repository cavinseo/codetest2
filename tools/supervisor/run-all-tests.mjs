// tests/ 아래 전부를 셰임으로 돌려 본다.
//   node tools/supervisor/run-all-tests.mjs
//
// 목적은 "전부 통과"가 아니라 **재현할 수 있는 범위를 정직하게 재는 것**이다.
// 돌아간 파일의 결과는 판정 근거가 되고, 못 돌린 파일은 못 돌렸다고 세어
// 사용자 로컬 게이트(`npx vitest run`)에 남는 몫을 드러낸다.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const TESTS = path.join(REPO, 'tests');

const files = readdirSync(TESTS).filter((name) => /\.test\.tsx?$/.test(name)).sort();
const rows = [];

for (const file of files) {
    const result = spawnSync('node', [
        '--experimental-strip-types', '--no-warnings',
        '--import', path.join(HERE, 'hook.mjs'),
        path.join(HERE, 'run-test-file.mjs'),
        path.join(TESTS, file),
    ], { cwd: REPO, encoding: 'utf8', timeout: 120_000 });

    const output = (result.stdout ?? '') + (result.stderr ?? '');
    const summary = output.match(/(\d+)\/(\d+) 통과, (\d+) 실패/);
    if (summary) {
        rows.push({ file, pass: +summary[1], total: +summary[2], fail: +summary[3] });
        continue;
    }
    const missing = output.match(/Cannot find package '([^']+)'/);
    rows.push({ file, unrunnable: missing ? `미설치 패키지: ${missing[1]}` : '기타' });
}

const ran = rows.filter((row) => !row.unrunnable);
const failing = ran.filter((row) => row.fail > 0);
const dead = rows.filter((row) => row.unrunnable);

console.log(`\n돌아간 파일 ${ran.length}/${rows.length} · 전부 통과 ${ran.length - failing.length} · 일부 실패 ${failing.length}`);
console.log(`테스트 ${ran.reduce((sum, r) => sum + r.pass, 0)}건 통과 / ${ran.reduce((sum, r) => sum + r.total, 0)}건 실행`);

if (failing.length > 0) {
    console.log('\n실패가 남은 파일:');
    for (const row of failing) console.log(`  ${row.file}  ${row.pass}/${row.total} (${row.fail} 실패)`);
}

if (dead.length > 0) {
    const byReason = new Map();
    for (const row of dead) byReason.set(row.unrunnable, [...(byReason.get(row.unrunnable) ?? []), row.file]);
    console.log(`\n못 돌린 파일 ${dead.length}건 — 사용자 로컬 게이트의 몫이다:`);
    for (const [reason, names] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
        console.log(`  ${String(names.length).padStart(3)}건  ${reason}  (예: ${names[0]})`);
    }
}
