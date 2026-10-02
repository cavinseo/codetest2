// 제품개요의 Markdown과 HTML을 실행 요소 없이 서식으로 표시한다.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const schema = { ...defaultSchema, strip: [...(defaultSchema.strip ?? []), 'style', 'iframe', 'object', 'embed'] };

interface Props {
    value?: string | null;
    emptyMessage?: string;
}

export default function ProductOverviewContent({ value, emptyMessage = '입력된 내용이 없습니다.' }: Props) {
    return <div className="min-w-0 overflow-x-auto break-words text-sm leading-6 text-white [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold [&_p]:mb-3 [&_p]:whitespace-pre-wrap [&_li]:whitespace-pre-wrap [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-primary-400 [&_blockquote]:pl-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-white/5 [&_pre]:p-3 [&_code]:font-mono [&_a]:text-primary-300 [&_a]:underline [&_table]:mb-3 [&_table]:border-collapse [&_th]:border [&_th]:border-white/20 [&_th]:p-2 [&_td]:border [&_td]:border-white/20 [&_td]:p-2 [&_img]:h-auto [&_img]:max-w-full [&_hr]:my-3 [&_hr]:border-white/20 [&_p:last-child]:mb-0">
        {value?.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}>{value}</ReactMarkdown> : <p>{emptyMessage}</p>}
    </div>;
}
