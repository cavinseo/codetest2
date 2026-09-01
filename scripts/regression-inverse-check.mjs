// 회귀 테스트 역검증. 수정만 임시로 되돌린 뒤, 그 결함을 잡으라고 넣은 테스트가
// 실제로 실패하는지 본다. 수정 전에도 통과하는 테스트는 회귀 테스트가 아니다.
// 일회용이다. 판정이 끝나면 지운다.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SCENARIOS = [
    {
        id: 'G-1',
        label: 'WS-3 리셋에서 가드를 걷어낸다',
        file: 'app/api/projects/[id]/attributes/route.ts',
        from: `        const confirmed = new URL(request.url).searchParams.get('confirmCascade') === 'true';
        const impact = await countAttributeCascadeImpact(prisma, projectId);
        if (impact.fitnesses > 0 && !confirmed) {`,
        to: `        const confirmed = true;
        const impact = { fitnesses: 0 };
        if (impact.fitnesses > 0 && !confirmed) {`,
        test: 'tests/api-worksheet-cascade.test.ts',
        expectFail: '적합도가 있으면 409 로 막고 아무것도 지우지 않는다',
    },
    {
        id: 'G-2',
        label: '리셋 가드가 제출 id 를 세게 만든다(잘못된 구현)',
        file: 'app/api/projects/[id]/attributes/route.ts',
        from: `        const impact = await countAttributeCascadeImpact(prisma, projectId);
        if (impact.fitnesses > 0 && !confirmed) {`,
        to: `        const impact = await countAttributeCascadeImpact(prisma, projectId, ['살아남는다']);
        if (impact.fitnesses > 0 && !confirmed) {`,
        test: 'tests/api-worksheet-cascade.test.ts',
        expectFail: '리셋은 전량 삭제이므로 살아남을 id 를 세지 않는다',
    },
];

function occurrences(haystack, needle) {
    let count = 0, at = haystack.indexOf(needle);
    while (at !== -1) { count++; at = haystack.indexOf(needle, at + needle.length); }
    return count;
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
console.log('Task G 회귀 역검증 — 수정을 되돌리면 "실패"해야 정상이다');
console.log('='.repeat(72));
let bad = 0;
for (const r of results) {
    let verdict;
    if (!r.ranSomething) { verdict = '판정불가 — 테스트가 실행되지 않았다'; bad++; }
    else if (r.failed) { verdict = 'OK — 결함을 잡는다'; }
    else { verdict = '문제 — 수정 전에도 통과한다'; bad++; }
    console.log(`${r.id.padEnd(5)} ${r.label.padEnd(38)} ${verdict}`);
    console.log(`      대상: ${r.expectFail}`);
}
console.log('='.repeat(72));
if (bad > 0) { console.log(`${bad} 건이 회귀를 잡지 못한다.`); process.exitCode = 1; }
else { console.log('전부 결함을 잡는다.'); }
