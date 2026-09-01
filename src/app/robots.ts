import type { MetadataRoute } from "next";

/** Приватное приложение — индексация не нужна. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
