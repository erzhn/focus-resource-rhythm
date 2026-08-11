import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: файл прокси (бывший middleware). Обновляет сессию Supabase и защищает маршруты.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Пропускаем статику и изображения.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
