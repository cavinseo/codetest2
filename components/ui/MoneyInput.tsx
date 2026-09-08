'use client';
// 금액 입력 중 소수점과 빈칸을 유지하고 표시에는 세 자리 구분을 적용한다.
import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { formatMoney, formatMoneyWithCaret, parseMoney } from '@/lib/money';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    value: number | string | null | undefined;
    onValueChange: (value: number | null) => void;
};

export default function MoneyInput({ value, onValueChange, ...props }: Props) {
    const [draft, setDraft] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const pendingCaret = useRef<number | null>(null);
    useLayoutEffect(() => {
        if (pendingCaret.current !== null && inputRef.current) {
            inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
            pendingCaret.current = null;
        }
    });
    return <input {...props} ref={inputRef} type="text" inputMode="decimal" value={draft ?? formatMoney(value)}
        onFocus={() => setDraft(formatMoney(value))}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
            props.onKeyDown?.(event);
            if (event.defaultPrevented) return;
            const input = event.currentTarget;
            const caret = input.selectionStart ?? 0;
            if (caret !== input.selectionEnd) return;
            if (event.key === 'Backspace' && input.value[caret - 1] === ',') input.setSelectionRange(caret - 2, caret);
            if (event.key === 'Delete' && input.value[caret] === ',') input.setSelectionRange(caret, caret + 2);
        }}
        onChange={(event) => {
            const text = event.target.value.replace(/,/g, '');
            if (!/^-?\d*(\.\d*)?$/.test(text)) return;
            const formatted = formatMoneyWithCaret(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
            pendingCaret.current = formatted.caret;
            event.currentTarget.value = formatted.text;
            event.currentTarget.setSelectionRange(formatted.caret, formatted.caret);
            setDraft(formatted.text);
            onValueChange(parseMoney(text));
        }} />;
}
