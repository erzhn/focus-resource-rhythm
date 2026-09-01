import type { MetadataRoute } from "next";
import { APP } from "@/config/app";

/** Манифест: позволяет установить приложение на домашний экран телефона. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP.name,
    short_name: "Фокус",
    description: APP.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#4f46e5",
    lang: "ru",
    icons: [{ src: "/icon", sizes: "64x64", type: "image/png" }],
  };
}
