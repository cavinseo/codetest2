import type { Metadata } from "next";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
    title: "Kano & QFD — Product Quality Intelligence",
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
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="antialiased bg-noise">
                <ThemeToggle />
                {children}
            </body>
        </html>
    );
}
