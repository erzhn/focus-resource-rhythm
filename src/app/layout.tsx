import type { Metadata, Viewport } from "next";
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
  // template подставляет заголовок раздела: «Календарь · Фокус — Ресурс — Ритм».
  title: { default: APP.name, template: `%s · ${APP.name}` },
  description: APP.tagline,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#141519" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // suppressHydrationWarning: скрипт ниже ставит data-theme на <html> до гидратации,
    // поэтому клиентский атрибут намеренно не совпадает с серверным — это ожидаемо.
    <html lang="ru" className={`${manrope.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        {/* Применяем сохранённую тему до рендера контента, чтобы не было мигания. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('frr-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
        <DemoStoreProvider>{children}</DemoStoreProvider>
      </body>
    </html>
  );
}
