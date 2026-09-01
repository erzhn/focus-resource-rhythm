import type { NextConfig } from "next";

/**
 * Заголовки безопасности. CSP намеренно не задаётся жёстко: Next инлайнит стили и
 * скрипты без nonce, и строгая политика ломает приложение. Остальные заголовки
 * закрывают кликджекинг, MIME-sniffing и утечку реферера.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Дублирует HSTS от Vercel — полезно при переезде на другой хостинг.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Запрещаем встраивание в чужие фреймы (современный аналог X-Frame-Options).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
