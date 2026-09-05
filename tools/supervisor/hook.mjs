// --import 로 걸어 쓰는 진입점. 해석 규칙은 resolver.mjs 에 있다.
//   node --experimental-strip-types --import ./tools/supervisor/hook.mjs <스크립트>
import { register } from 'node:module';
register(new URL('./resolver.mjs', import.meta.url));
