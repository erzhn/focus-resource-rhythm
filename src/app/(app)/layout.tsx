import type { ReactNode } from "react";
import { QuickAddProvider } from "@/components/quick-add";
import { AppShell } from "@/components/app-shell";

/** Оболочка приложения (навигация + быстрое добавление) для приватных экранов. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <QuickAddProvider>
      <AppShell>{children}</AppShell>
    </QuickAddProvider>
  );
}
