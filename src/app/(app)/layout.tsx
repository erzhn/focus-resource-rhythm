import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { QuickAddProvider } from "@/components/quick-add";
import { TaskEditProvider } from "@/components/task-edit";
import { CommandMenu } from "@/components/command-menu";
import { AppShell } from "@/components/app-shell";

/** Оболочка приложения: навигация, быстрое добавление, редактирование, ⌘K, анимации. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <QuickAddProvider>
        <TaskEditProvider>
          <CommandMenu />
          <AppShell>{children}</AppShell>
        </TaskEditProvider>
      </QuickAddProvider>
    </MotionConfig>
  );
}
