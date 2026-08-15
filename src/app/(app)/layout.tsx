import type { ReactNode } from "react";
import { QuickAddProvider } from "@/components/quick-add";
import { TaskEditProvider } from "@/components/task-edit";
import { AppShell } from "@/components/app-shell";

/** Оболочка приложения (навигация + быстрое добавление + редактирование) для приватных экранов. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <QuickAddProvider>
      <TaskEditProvider>
        <AppShell>{children}</AppShell>
      </TaskEditProvider>
    </QuickAddProvider>
  );
}
