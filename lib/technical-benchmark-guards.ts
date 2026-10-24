// technical_benchmarks 테이블이 아직 없을 때(마이그레이션 미적용)를 알아보는 판정.
//
// 이 판정이 라우트 안에 묻혀 있으면 "아무 오류나 빈 목록으로 삼키는" 회귀가 조용히
// 들어올 수 있어 밖으로 뺐다. 삼켜도 되는 것은 오직 "테이블이 없다" 하나뿐이다.
//
// Prisma 는 없는 테이블을 P2021 로 알린다. 마이그레이션을 적용하기 전 raw SQL 경로로
// 새는 경우를 대비해 Postgres 원본 코드 42P01(undefined_table)도 함께 본다.

// unknown 으로 둬 code 를 문자열로 좁히지 않고도 includes 에 넘길 수 있게 한다. 배열에는
// 문자열만 있어 문자열이 아닌 code 는 어차피 맞지 않으므로, 따로 typeof 검사를 두면
// 결과가 같은 군더더기 조건이 되고 그 검사가 빠지는 회귀를 테스트로 잡을 수 없다.
const MISSING_TABLE_CODES: readonly unknown[] = ['P2021', '42P01'];

/** 이 오류가 "technical_benchmarks 테이블이 아직 없다"는 뜻인가. */
export function isMissingTechnicalBenchmarkTable(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;

    const code = (error as { code?: unknown }).code;
    if (!MISSING_TABLE_CODES.includes(code)) return false;

    // 다른 테이블이 없어서 난 오류까지 삼키면 진짜 결함이 빈 화면으로 숨는다.
    // Prisma 는 meta.table 에, 드라이버는 메시지에 테이블 이름을 담는다.
    const table = (error as { meta?: { table?: unknown } }).meta?.table;
    if (typeof table === 'string') return table.includes('technical_benchmarks');

    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && message.includes('technical_benchmarks');
}
