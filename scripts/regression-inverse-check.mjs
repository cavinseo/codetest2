// 회귀 테스트 역검증. 수정만 임시로 되돌린 뒤, 그 결함을 잡으라고 넣은 테스트가
// 실제로 실패하는지 본다. 수정 전에도 통과하는 테스트는 회귀 테스트가 아니다.
//
// 이 스크립트는 일회용이다. 판정이 끝나면 지운다.
//
// 시나리오마다 `from` 이 파일에 정확히 한 번 나와야 한다. 안 그러면 치환이 조용히
// 빗나가고, 테스트가 통과해 "회귀를 못 잡는다"는 거짓 결론이 난다. 그래서 개수를
// 먼저 세고 다르면 즉시 죽는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SCENARIOS = [
    {
        id: 'A-1',
        label: 'WS-2 조기 반환을 되살린다',
        file: 'app/api/projects/[id]/spec/route.ts',
        from: `        // 삭제와 삽입을 하나의 트랜잭션으로 묶어 중간 실패 시 롤백`,
        to: `        if (newSpecs.length === 0) {
            return NextResponse.json({ specFunctions: [], message: '스펙이 저장되었습니다' });
        }

        // 삭제와 삽입을 하나의 트랜잭션으로 묶어 중간 실패 시 롤백`,
        test: 'tests/api-spec-save.test.ts',
        expectFail: '빈 배열을 보내면 deleteMany 가 실행된다',
    },
    {
        id: 'A-2',
        label: 'WS-2 zod 검증을 걷어낸다',
        file: 'app/api/projects/[id]/spec/route.ts',
        from: `        const { specFunctions: newSpecs } = specBodySchema.parse(await request.json());`,
        to: `        const body = await request.json();
        const newSpecs: Array<{ id?: string; level: string; name: string; parentId?: string; technology?: string; order: number }> = body.specFunctions || [];`,
        test: 'tests/api-spec-save.test.ts',
        expectFail: 'specFunctions 가 배열이 아니면 400 이고 deleteMany 를 부르지 않는다',
    },
    {
        id: 'B-1',
        label: 'WS-3 전량 deleteMany 를 되살린다',
        file: 'app/api/projects/[id]/attributes/route.ts',
        from: `            await tx.productAttribute.deleteMany({
                where: submittedIds.length > 0
                    ? { projectId, id: { notIn: submittedIds } }
                    : { projectId },
            });`,
        to: `            await tx.productAttribute.deleteMany({
                where: { projectId },
            });`,
        test: 'tests/api-worksheet-cascade.test.ts',
        expectFail: '제출에서 빠진 행만 지운다',
    },
    {
        id: 'B-2',
        label: 'WS-3 가드가 제출 id 를 다시 무시하게 한다',
        file: 'app/api/projects/[id]/attributes/route.ts',
        from: `        const impact = await countAttributeCascadeImpact(prisma, projectId, submittedIds);`,
        to: `        const impact = await countAttributeCascadeImpact(prisma, projectId);`,
        test: 'tests/api-worksheet-cascade.test.ts',
        expectFail: 'id 를 유지한 정상 편집은 적합도가 있어도 통과한다',
    },
    {
        id: 'C-1',
        label: '행병합 숨김 판정에서 core 비교를 뺀다',
        file: 'lib/product-attributes-utils.ts',
        from: `    if (index > 0 && isSameGroup(rows[index - 1])) return 0;`,
        to: `    if (index > 0 && rows[index - 1][key] === current[key]) return 0;`,
        test: 'tests/product-attributes-utils.test.ts',
        expectFail: 'core 가 다르면 sub 이름이 같아도 두 행 모두 칸을 그린다',
    },
];

function occurrences(haystack, needle) {
    let count = 0;
    let at = haystack.indexOf(needle);
    while (at !== -1) {
        count++;
        at = haystack.indexOf(needle, at + needle.length);
    }
    return count;
}

const results = [];

for (const scenario of SCENARIOS) {
    const original = readFileSync(scenario.file, 'utf8');
    const found = occurrences(original, scenario.from);
    if (found !== 1) {
        console.error(`[${scenario.id}] 치환 대상이 ${found} 번 나온다(1 이어야 한다). 중단한다.`);
        console.error(`  파일: ${scenario.file}`);
        process.exit(1);
    }

    writeFileSync(scenario.file, original.replace(scenario.from, scenario.to));
    console.log(`[${scenario.id}] ${scenario.label} → ${scenario.test}`);

    const run = spawnSync(
        'npx',
        ['vitest', 'run', '--pool=threads', scenario.test, '-t', scenario.expectFail],
        { encoding: 'utf8' }
    );

    // 원복은 어떤 경우에도 한다. 여기서 빠지면 다음 시나리오가 오염된 파일 위에서 돈다.
    writeFileSync(scenario.file, original);

    const output = `${run.stdout}\n${run.stderr}`;
    const ranSomething = /Tests\s+\d/.test(output);
    const failed = run.status !== 0;

    results.push({
        ...scenario,
        failed,
        ranSomething,
        summary: (output.match(/Tests\s+.*$/m) || ['(요약 없음)'])[0].trim(),
    });

    console.log(`      ${failed ? '실패함(정상)' : '통과함(문제)'}  ${results.at(-1).summary}\n`);
}

console.log('='.repeat(72));
console.log('회귀 테스트 역검증 결과 — 수정을 되돌리면 "실패"해야 정상이다');
console.log('='.repeat(72));

let bad = 0;
for (const r of results) {
    let verdict;
    if (!r.ranSomething) {
        verdict = '판정불가 — 테스트가 하나도 실행되지 않았다(이름이 안 맞는다)';
        bad++;
    } else if (r.failed) {
        verdict = 'OK — 결함을 잡는다';
    } else {
        verdict = '문제 — 수정 전에도 통과한다. 회귀 테스트가 아니다';
        bad++;
    }
    console.log(`${r.id.padEnd(5)} ${r.label.padEnd(34)} ${verdict}`);
    console.log(`      대상: ${r.expectFail}`);
}

console.log('='.repeat(72));
if (bad > 0) {
    console.log(`${bad} 건이 회귀를 잡지 못한다.`);
    process.exitCode = 1;
} else {
    console.log('전부 결함을 잡는다.');
}
