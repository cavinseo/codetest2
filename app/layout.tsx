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
        <html lang="ko" className="dark">
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
