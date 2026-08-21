import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// tests/integration 전용 설정.
//
// vitest.config.ts 의 exclude 는 tests/integration/** 를 막아 `npm test` 가 DB 없이
// 돈다. Vitest 의 CLI 필터(`vitest run tests/integration`)는 이미 exclude 로 걸러진
// 파일을 되살리지 못하고(필터는 include-exclude 로 확정된 목록을 "좁히기"만 한다),
// `--exclude` 플래그도 설정 파일의 exclude 에 추가만 될 뿐 제거하지 못한다. 그래서
// 같은 vitest.config.ts 를 공유해서는 통합 테스트만 골라 돌릴 방법이 없다.
// test:integration 스크립트는 이 파일을 --config 로 명시해 별도 include 를 쓴다.
export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('.', import.meta.url)),
        },
    },
    test: {
        include: ['tests/integration/**/*.test.ts'],
        exclude: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
    },
});
