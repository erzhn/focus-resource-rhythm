import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { APP } from "@/config/app";
import { DemoStoreProvider } from "@/lib/demo/store";
import { QuickAddProvider } from "@/components/quick-add";
import { AppShell } from "@/components/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP.name,
  description: APP.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <DemoStoreProvider>
          <QuickAddProvider>
            <AppShell>{children}</AppShell>
          </QuickAddProvider>
        </DemoStoreProvider>
      </body>
    </html>
  );
}
