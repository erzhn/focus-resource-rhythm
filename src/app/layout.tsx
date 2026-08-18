import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Manrope } from "next/font/google";
import "./globals.css";
import { APP } from "@/config/app";
import { DemoStoreProvider } from "@/lib/demo/store";

// Manrope — переменный, геометричный, с кириллицей. Единый шрифт для текста и заголовков.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: APP.name,
  description: APP.tagline,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru" className={`${manrope.variable} h-full antialiased`}>
      <head>
        {/* Применяем сохранённую тему до рендера, чтобы не было мигания. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('frr-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        <DemoStoreProvider>{children}</DemoStoreProvider>
      </body>
    </html>
  );
}
