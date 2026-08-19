import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { ToastProvider } from "@/components/ui/toast";
import { QuickAddProvider } from "@/components/quick-add";
import { TaskEditProvider } from "@/components/task-edit";
import { CommandMenu } from "@/components/command-menu";
import { AppShell } from "@/components/app-shell";

/** Оболочка приложения: навигация, быстрое добавление, редактирование, ⌘K, тосты, анимации. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <QuickAddProvider>
          <TaskEditProvider>
            <CommandMenu />
            <AppShell>{children}</AppShell>
          </TaskEditProvider>
        </QuickAddProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
