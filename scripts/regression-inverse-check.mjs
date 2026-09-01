// 회귀 테스트 역검증. 수정만 임시로 되돌린 뒤 그 결함을 잡으라고 넣은 테스트가
// 실제로 실패하는지 본다. 수정 전에도 통과하는 테스트는 회귀 테스트가 아니다. 일회용.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SCENARIOS = [
    {
        id: 'H-1',
        label: '쿠키 이름을 부분 일치로 찾는다(흔한 실수)',
        file: 'lib/signup-prefill.ts',
        from: `        if (trimmed.slice(0, eq) !== name) continue;`,
        to: `        if (!trimmed.includes(name)) continue;`,
        test: 'tests/signup-prefill.test.ts',
        expectFail: '이름이 부분 일치하는 쿠키에 속지 않는다',
    },
    {
        id: 'H-2',
        label: "값을 '=' 로 통째 split 한다",
        file: 'lib/signup-prefill.ts',
        from: `        const raw = trimmed.slice(eq + 1);`,
        to: `        const raw = trimmed.split('=')[1];`,
        test: 'tests/signup-prefill.test.ts',
        expectFail: '첫 = 만 구분자로 쓴다',
    },
    {
        id: 'H-3',
        label: '이메일 형태 검사를 걷어낸다',
        file: 'lib/signup-prefill.ts',
        from: `    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(trimmed)) return null;`,
        to: `    if (false) return null;`,
        test: 'tests/signup-prefill.test.ts',
        expectFail: '이메일 형태가 아니면 null 이다',
    },
];

function occurrences(h, n) {
    let c = 0, i = h.indexOf(n);
    while (i !== -1) { c++; i = h.indexOf(n, i + n.length); }
    return c;
}

const results = [];
for (const s of SCENARIOS) {
    const original = readFileSync(s.file, 'utf8');
    const found = occurrences(original, s.from);
    if (found !== 1) {
        console.error(`[${s.id}] 치환 대상이 ${found} 번 나온다(1 이어야 한다). 중단한다.`);
        process.exit(1);
    }
    writeFileSync(s.file, original.replace(s.from, s.to));
    console.log(`[${s.id}] ${s.label}`);
    const run = spawnSync('npx', ['vitest', 'run', '--pool=threads', s.test, '-t', s.expectFail], { encoding: 'utf8' });
    writeFileSync(s.file, original);
    const output = `${run.stdout}\n${run.stderr}`;
    results.push({
        ...s,
        failed: run.status !== 0,
        ranSomething: /Tests\s+\d/.test(output),
        summary: (output.match(/Tests\s+.*$/m) || ['(요약 없음)'])[0].trim(),
    });
    console.log(`      ${results.at(-1).failed ? '실패함(정상)' : '통과함(문제)'}  ${results.at(-1).summary}\n`);
}

console.log('='.repeat(72));
console.log('Task H 회귀 역검증 — 수정을 되돌리면 "실패"해야 정상이다');
console.log('='.repeat(72));
let bad = 0;
for (const r of results) {
    let verdict;
    if (!r.ranSomething) { verdict = '판정불가 — 테스트가 실행되지 않았다'; bad++; }
    else if (r.failed) { verdict = 'OK — 결함을 잡는다'; }
    else { verdict = '문제 — 수정 전에도 통과한다'; bad++; }
    console.log(`${r.id.padEnd(5)} ${r.label.padEnd(36)} ${verdict}`);
    console.log(`      대상: ${r.expectFail}`);
}
console.log('='.repeat(72));
if (bad > 0) { console.log(`${bad} 건이 회귀를 잡지 못한다.`); process.exitCode = 1; }
else { console.log('전부 결함을 잡는다.'); }
