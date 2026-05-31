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
