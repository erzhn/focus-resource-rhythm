import { describe, expect, it } from "vitest";
import { pickBaseUrl, pickRedirectUri } from "./redirect-uri.pure";

describe("pickBaseUrl", () => {
  it("APP_BASE_URL имеет приоритет и теряет хвостовой слэш", () => {
    expect(pickBaseUrl({ APP_BASE_URL: "https://app.example.com/", VERCEL_URL: "x.vercel.app" }))
      .toBe("https://app.example.com");
  });
  it("продакшен-домен Vercel важнее домена конкретного деплоя", () => {
    expect(pickBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "app.vercel.app", VERCEL_URL: "dep-123.vercel.app" }))
      .toBe("https://app.vercel.app");
  });
  it("preview-деплой без продакшен-домена", () => {
    expect(pickBaseUrl({ VERCEL_URL: "dep-123.vercel.app" })).toBe("https://dep-123.vercel.app");
  });
  it("пустое окружение — localhost", () => {
    expect(pickBaseUrl({})).toBe("http://localhost:3000");
  });
  it("пробелы и пустые строки игнорируются", () => {
    expect(pickBaseUrl({ APP_BASE_URL: "   ", VERCEL_URL: "dep.vercel.app" })).toBe("https://dep.vercel.app");
  });
});

describe("pickRedirectUri", () => {
  it("строит адрес из базового URL", () => {
    expect(pickRedirectUri({ APP_BASE_URL: "https://app.example.com" }, "google"))
      .toBe("https://app.example.com/api/integrations/google/callback");
    expect(pickRedirectUri({ APP_BASE_URL: "https://app.example.com" }, "microsoft"))
      .toBe("https://app.example.com/api/integrations/microsoft/callback");
  });
  it("явный REDIRECT_URI перекрывает вычисление", () => {
    expect(pickRedirectUri({ APP_BASE_URL: "https://app.example.com", GOOGLE_REDIRECT_URI: "https://other/cb" }, "google"))
      .toBe("https://other/cb");
  });
  it("явный адрес одного провайдера не влияет на другого", () => {
    const env = { APP_BASE_URL: "https://app.example.com", GOOGLE_REDIRECT_URI: "https://other/cb" };
    expect(pickRedirectUri(env, "microsoft")).toBe("https://app.example.com/api/integrations/microsoft/callback");
  });
});
