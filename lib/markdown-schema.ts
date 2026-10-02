// 개요 미리보기와 보고서가 같은 HTML 허용 규칙을 사용하도록 한다.
import { defaultSchema } from 'rehype-sanitize';

export const markdownSchema = { ...defaultSchema, strip: [...(defaultSchema.strip ?? []), 'style', 'iframe', 'object', 'embed'] };
