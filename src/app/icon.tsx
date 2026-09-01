import { ImageResponse } from "next/og";

/** Иконка приложения генерируется из кода — вместо дефолтного логотипа Next.js. */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center",
          justifyContent: "center", background: "#4f46e5", borderRadius: 14,
          color: "#fff", fontSize: 38, fontWeight: 800, letterSpacing: -1,
        }}
      >
        Ф
      </div>
    ),
    size,
  );
}
