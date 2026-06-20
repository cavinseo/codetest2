// 소스 파일의 한글 인코딩 깨짐을 검사하는 스크립트입니다.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['app', 'components', 'lib', 'prisma', 'tests'];
const TARGET_EXTENSIONS = new Set([
    '.css',
    '.js',
    '.jsx',
    '.json',
    '.mjs',
    '.prisma',
    '.sql',
    '.ts',
    '.tsx',
]);

const SUSPICIOUS_PATTERNS = [
    { name: 'Unicode replacement character', pattern: /\uFFFD/u },
    { name: 'Latin mojibake marker', pattern: /[ÃÂâìíëêðŸ]/u },
    { name: 'Korean mojibake sequence', pattern: /[\u4E00-\u9FFF\uF900-\uFAFF][\uAC00-\uD7A3\u3131-\u318E]/u },
];

async function collectFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectFiles(fullPath));
            continue;
        }

        if (TARGET_EXTENSIONS.has(path.extname(entry.name))) {
            files.push(fullPath);
        }
    }

    return files;
}

const findings = [];

for (const targetDir of TARGET_DIRS) {
    const absoluteDir = path.join(ROOT, targetDir);
    const files = await collectFiles(absoluteDir);

    for (const file of files) {
        const content = await readFile(file, 'utf8');
        const lines = content.split(/\r?\n/);

        lines.forEach((line, index) => {
            for (const { name, pattern } of SUSPICIOUS_PATTERNS) {
                if (pattern.test(line)) {
                    findings.push({
                        file: path.relative(ROOT, file),
                        line: index + 1,
                        name,
                        text: line.trim(),
                    });
                }
            }
        });
    }
}

if (findings.length > 0) {
    console.error('한글 인코딩 깨짐으로 의심되는 문자열이 발견되었습니다.');
    for (const finding of findings) {
        console.error(`${finding.file}:${finding.line} ${finding.name}: ${finding.text}`);
    }
    process.exit(1);
}

console.log('한글 인코딩 검사 통과.');
