import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
    {
        ignores: [
            '.next/**',
            // 도구가 만든 저장소 사본(git worktree 등). 그 안의 .next 빌드 산출물까지
            // 검사 대상이 되면 내 코드와 무관한 오류가 쏟아진다.
            '.claude/**',
            'node_modules/**',
            'prisma/dev.db',
            'tsconfig.tsbuildinfo',
            '*.log',
            'codex-*.log',
            'testsprite_tests/**',
        ],
    },
    ...compat.extends('next/core-web-vitals'),
];

export default eslintConfig;
