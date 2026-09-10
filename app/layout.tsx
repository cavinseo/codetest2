import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import OnboardingRedirect from "@/components/OnboardingRedirect";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});

const outfit = Outfit({
    subsets: ["latin"],
    variable: "--font-outfit",
    display: "swap",
});

export const metadata: Metadata = {
    title: "KS-QFD — Product Quality Intelligence",
    description: "AI-powered Kano survey analysis and QFD matrix for building products people love",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const themeScript = `
        (function() {
            try {
                var theme = localStorage.getItem('kano-qfd-theme') || 'dark';
                document.documentElement.classList.toggle('light', theme === 'light');
                document.documentElement.classList.toggle('dark', theme !== 'light');
            } catch (e) {}
        })();
    `;

    return (
        // suppressHydrationWarning 은 바로 아래 스크립트 때문이다. 서버는 늘 dark 로
        // 그리는데 그 스크립트가 저장된 취향을 읽어 light 로 바꾸므로, React 가
        // 이 태그의 class 불일치를 오류로 잡는다. 깜빡임 없이 테마를 입히려면
        // 스크립트가 hydration 보다 먼저 돌아야 하니 불일치 자체는 피할 수 없다.
        // 이 속성은 이 태그의 속성 차이만 덮고 자식 트리에는 번지지 않으므로,
        // 다른 진짜 hydration 오류는 그대로 드러난다.
        <html lang="ko" className="dark" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
            </head>
            {/* 주/야간 버튼은 각 화면의 헤더(워크시트는 상단 메뉴바) 안에 둔다 — 화면 위에
                떠 있으면 헤더 버튼과 가로 스크롤되는 탭을 가린다. */}
            <body className={`${inter.variable} ${outfit.variable} antialiased bg-noise`}>
                <OnboardingRedirect />
                {children}
            </body>
        </html>
    );
}
