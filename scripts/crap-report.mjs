// 함수별 CRAP 지수와 뮤테이션 점수를 하나의 마크다운 보고서로 합치는 스크립트입니다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const COVERAGE_PATH = process.env.CRAP_COVERAGE ?? 'coverage/coverage-final.json';
const COMPLEXITY_PATH = process.env.CRAP_COMPLEXITY ?? 'eslint-complexity.json';
const MUTATION_PATH = process.env.CRAP_MUTATION ?? 'reports/mutation/stryker-crap-report.json';
const OUT_MARKDOWN = process.env.CRAP_OUT ?? 'crap-report.md';
const OUT_JSON = process.env.CRAP_OUT_JSON ?? 'crap-report.json';

// CRAP 원 논문의 기준선이다. 복잡도 5 짜리 함수가 커버리지 0% 일 때 30 을 처음
// 넘기므로, "복잡한데 안 덮인" 함수만 정확히 걸러내는 값으로 쓰인다.
const CRAP_LIMIT = 30;
// 30 미만이라도 커버리지가 빠지면 급격히 나빠지는 구간이라 경고선을 따로 둔다.
const CRAP_WARN = 15;

function crapScore(complexity, coverage) {
    const uncovered = 1 - coverage;
    return complexity ** 2 * uncovered ** 3 + complexity;
}

async function readJson(filePath) {
    try {
        return JSON.parse(await readFile(path.resolve(ROOT, filePath), 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

function toRepoPath(absolutePath) {
    return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

// ── CRAP ────────────────────────────────────────────────────────────────────

// istanbul 의 fnMap 은 함수마다 decl(선언부)과 loc(본문)을 따로 담는다. 어느 쪽이
// 먼저 시작하는지는 함수 종류마다 달라서 둘을 합친 범위를 함수의 구간으로 본다.
function functionSpan(fn) {
    const starts = [fn.decl?.start?.line, fn.loc?.start?.line].filter((line) => typeof line === 'number');
    const ends = [fn.decl?.end?.line, fn.loc?.end?.line].filter((line) => typeof line === 'number');
    return { start: Math.min(...starts), end: Math.max(...ends) };
}

// 중첩 함수의 문장까지 바깥 함수 커버리지에 넣으면, 테스트되지 않은 콜백 하나가
// 바깥 함수 점수를 끌어내려 원인 함수를 가린다. ESLint 의 복잡도도 중첩 함수를
// 따로 세므로 커버리지 쪽도 같은 기준으로 떼어낸다.
function statementCoverage(entry, span, allSpans) {
    const nested = allSpans.filter((other) =>
        other.start >= span.start && other.end <= span.end && !(other.start === span.start && other.end === span.end));

    let covered = 0;
    let total = 0;

    for (const [id, location] of Object.entries(entry.statementMap ?? {})) {
        const line = location.start?.line;
        if (typeof line !== 'number' || line < span.start || line > span.end) continue;
        if (nested.some((other) => line >= other.start && line <= other.end)) continue;

        total += 1;
        if ((entry.s?.[id] ?? 0) > 0) covered += 1;
    }

    return { covered, total };
}

function collectCrapRows(coverage, complexityReport) {
    const coverageByPath = new Map();
    for (const [key, entry] of Object.entries(coverage)) {
        coverageByPath.set(toRepoPath(entry.path ?? key), entry);
    }

    const rows = [];
    const unmatched = [];

    for (const file of complexityReport) {
        const repoPath = toRepoPath(file.filePath);
        const entry = coverageByPath.get(repoPath);
        const messages = (file.messages ?? []).filter((message) => message.ruleId === 'complexity');
        if (messages.length === 0) continue;

        if (!entry) {
            unmatched.push({ file: repoPath, reason: '커버리지 데이터 없음', functions: messages.length });
            continue;
        }

        const spans = Object.values(entry.fnMap ?? {}).map((fn) => ({ fn, ...functionSpan(fn) }));
        const allSpans = spans.map(({ start, end }) => ({ start, end }));

        for (const message of messages) {
            const complexity = Number(/has a complexity of (\d+)/.exec(message.message)?.[1]);
            if (!Number.isFinite(complexity)) continue;

            // ESLint 는 함수 노드의 시작 위치를, istanbul 은 선언부나 본문 시작을 준다.
            // 같은 줄이거나 한 줄 차이까지만 같은 함수로 인정한다.
            const candidate = spans
                .map((span) => ({ span, distance: Math.abs(span.start - message.line) }))
                .filter(({ distance }) => distance <= 1)
                .sort((left, right) => left.distance - right.distance)[0];

            if (!candidate) {
                unmatched.push({ file: repoPath, reason: `${message.line}행 함수를 커버리지에서 못 찾음`, functions: 1 });
                continue;
            }

            const { covered, total } = statementCoverage(entry, candidate.span, allSpans);
            const coverageRatio = total === 0 ? 1 : covered / total;

            rows.push({
                file: repoPath,
                line: message.line,
                name: message.message.replace(/\s*has a complexity of.*$/, ''),
                complexity,
                coverage: coverageRatio,
                statements: `${covered}/${total}`,
                crap: crapScore(complexity, coverageRatio),
            });
        }
    }

    rows.sort((left, right) => right.crap - left.crap || right.complexity - left.complexity);
    return { rows, unmatched };
}

function crapSection(rows, unmatched) {
    const over = rows.filter((row) => row.crap > CRAP_LIMIT);
    const warn = rows.filter((row) => row.crap > CRAP_WARN && row.crap <= CRAP_LIMIT);
    const fullyCovered = rows.filter((row) => row.coverage === 1).length;

    const lines = [];
    lines.push('## 1. CRAP 지수');
    lines.push('');
    lines.push('`CRAP(f) = 복잡도² × (1 − 커버리지)³ + 복잡도`. 복잡도는 ESLint `complexity` 규칙(McCabe),');
    lines.push('커버리지는 v8 문장 커버리지에서 중첩 함수 구간을 뺀 값이다.');
    lines.push('');
    lines.push('| 지표 | 값 |');
    lines.push('| --- | --- |');
    lines.push(`| 측정 함수 | ${rows.length} |`);
    lines.push(`| 커버리지 100% 함수 | ${fullyCovered} (${rows.length ? Math.round((fullyCovered / rows.length) * 100) : 0}%) |`);
    lines.push(`| CRAP > ${CRAP_LIMIT} (위험) | ${over.length} |`);
    lines.push(`| ${CRAP_WARN} < CRAP ≤ ${CRAP_LIMIT} (주의) | ${warn.length} |`);
    lines.push(`| 최대 CRAP | ${rows.length ? rows[0].crap.toFixed(1) : '-'} |`);
    lines.push('');

    if (over.length > 0) {
        lines.push(`### 위험 — CRAP > ${CRAP_LIMIT}`);
        lines.push('');
        lines.push('| CRAP | 복잡도 | 커버리지 | 문장 | 함수 | 위치 |');
        lines.push('| ---: | ---: | ---: | ---: | --- | --- |');
        for (const row of over) {
            lines.push(`| ${row.crap.toFixed(1)} | ${row.complexity} | ${(row.coverage * 100).toFixed(0)}% | ${row.statements} | ${row.name} | \`${row.file}:${row.line}\` |`);
        }
        lines.push('');
    } else {
        lines.push(`CRAP 이 ${CRAP_LIMIT} 을 넘는 함수는 없다.`);
        lines.push('');
    }

    if (warn.length > 0) {
        lines.push(`### 주의 — ${CRAP_WARN} < CRAP ≤ ${CRAP_LIMIT}`);
        lines.push('');
        lines.push('| CRAP | 복잡도 | 커버리지 | 문장 | 함수 | 위치 |');
        lines.push('| ---: | ---: | ---: | ---: | --- | --- |');
        for (const row of warn) {
            lines.push(`| ${row.crap.toFixed(1)} | ${row.complexity} | ${(row.coverage * 100).toFixed(0)}% | ${row.statements} | ${row.name} | \`${row.file}:${row.line}\` |`);
        }
        lines.push('');
    }

    if (unmatched.length > 0) {
        lines.push('### 측정 제외');
        lines.push('');
        lines.push('| 파일 | 함수 수 | 사유 |');
        lines.push('| --- | ---: | --- |');
        for (const item of unmatched) {
            lines.push(`| \`${item.file}\` | ${item.functions} | ${item.reason} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ── 뮤테이션 ────────────────────────────────────────────────────────────────

const KILLED = new Set(['Killed', 'Timeout']);
const SURVIVED = new Set(['Survived', 'NoCoverage']);

function collectMutationRows(report) {
    const rows = [];
    const survivors = [];

    for (const [filePath, file] of Object.entries(report.files ?? {})) {
        const repoPath = filePath.split(path.sep).join('/').replace(/^.*?(?=lib\/)/, '');
        let killed = 0;
        let survived = 0;
        let ignored = 0;

        for (const mutant of file.mutants ?? []) {
            if (KILLED.has(mutant.status)) killed += 1;
            else if (SURVIVED.has(mutant.status)) {
                survived += 1;
                survivors.push({
                    file: repoPath,
                    line: mutant.location?.start?.line,
                    mutator: mutant.mutatorName,
                    status: mutant.status,
                    replacement: (mutant.replacement ?? '').replace(/\s+/g, ' ').slice(0, 60),
                });
            } else ignored += 1;
        }

        const scored = killed + survived;
        rows.push({
            file: repoPath,
            killed,
            survived,
            ignored,
            score: scored === 0 ? null : (killed / scored) * 100,
        });
    }

    rows.sort((left, right) => (left.score ?? 101) - (right.score ?? 101));
    return { rows, survivors };
}

function mutationSection(rows, survivors) {
    const killed = rows.reduce((sum, row) => sum + row.killed, 0);
    const survived = rows.reduce((sum, row) => sum + row.survived, 0);
    const total = killed + survived;

    const lines = [];
    lines.push('## 2. 뮤테이션 테스트');
    lines.push('');
    lines.push('대상은 `stryker.crap.config.json` 의 순수 lib 모듈이다. 라우트 핸들러는 Prisma mock 이');
    lines.push('뮤턴트를 흡수해 점수를 부풀리므로 제외돼 있다.');
    lines.push('');
    lines.push('| 지표 | 값 |');
    lines.push('| --- | --- |');
    lines.push(`| 대상 파일 | ${rows.length} |`);
    lines.push(`| 죽인 뮤턴트 | ${killed} |`);
    lines.push(`| 살아남은 뮤턴트 | ${survived} |`);
    lines.push(`| 전체 뮤테이션 점수 | ${total ? ((killed / total) * 100).toFixed(2) : '-'}% |`);
    lines.push('');
    lines.push('| 점수 | 죽임 | 생존 | 파일 |');
    lines.push('| ---: | ---: | ---: | --- |');
    for (const row of rows) {
        lines.push(`| ${row.score === null ? '-' : row.score.toFixed(1) + '%'} | ${row.killed} | ${row.survived} | \`${row.file}\` |`);
    }
    lines.push('');

    if (survivors.length > 0) {
        lines.push('### 살아남은 뮤턴트');
        lines.push('');
        lines.push('| 위치 | 상태 | 뮤테이터 | 치환 |');
        lines.push('| --- | --- | --- | --- |');
        for (const survivor of survivors) {
            lines.push(`| \`${survivor.file}:${survivor.line}\` | ${survivor.status} | ${survivor.mutator} | \`${survivor.replacement}\` |`);
        }
        lines.push('');
    } else {
        lines.push('살아남은 뮤턴트가 없다 — 대상 모듈의 뮤테이션 점수는 100% 다.');
        lines.push('');
    }

    return lines.join('\n');
}

// ── 실행 ────────────────────────────────────────────────────────────────────

const coverage = await readJson(COVERAGE_PATH);
const complexityReport = await readJson(COMPLEXITY_PATH);
const mutationReport = await readJson(MUTATION_PATH);

const sections = ['# CRAP · 뮤테이션 점검 결과', ''];
const payload = {};

if (coverage && complexityReport) {
    const { rows, unmatched } = collectCrapRows(coverage, complexityReport);
    sections.push(crapSection(rows, unmatched));
    payload.crap = { limit: CRAP_LIMIT, warn: CRAP_WARN, rows, unmatched };
} else {
    sections.push('## 1. CRAP 지수', '', `입력이 없어 건너뛰었다 (커버리지 \`${COVERAGE_PATH}\`, 복잡도 \`${COMPLEXITY_PATH}\`).`, '');
}

if (mutationReport) {
    const { rows, survivors } = collectMutationRows(mutationReport);
    sections.push(mutationSection(rows, survivors));
    payload.mutation = { rows, survivors };
} else {
    sections.push('## 2. 뮤테이션 테스트', '', `입력이 없어 건너뛰었다 (\`${MUTATION_PATH}\`).`, '');
}

const markdown = sections.join('\n');
await mkdir(path.dirname(path.resolve(ROOT, OUT_MARKDOWN)), { recursive: true });
await writeFile(path.resolve(ROOT, OUT_MARKDOWN), markdown, 'utf8');
await writeFile(path.resolve(ROOT, OUT_JSON), JSON.stringify(payload), 'utf8');

console.log(markdown);

// CI 아티팩트를 내려받지 못하는 환경에서도 원본 수치를 되살릴 수 있게 로그에 싣는다.
const encoded = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64');
console.log('=== BEGIN CRAP_PAYLOAD_B64 ===');
for (let index = 0; index < encoded.length; index += 500) {
    console.log(encoded.slice(index, index + 500));
}
console.log('=== END CRAP_PAYLOAD_B64 ===');
