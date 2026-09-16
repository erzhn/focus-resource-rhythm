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

// Отдельный класс ошибок: localhost, случайно попавший в переменные облака.
describe("localhost в облаке игнорируется", () => {
  const cloud = { VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "app.vercel.app" };

  it("APP_BASE_URL=localhost не используется на Vercel", () => {
    expect(pickBaseUrl({ ...cloud, APP_BASE_URL: "http://localhost:3000" })).toBe("https://app.vercel.app");
  });

  it("явный REDIRECT_URI на localhost тоже отбрасывается", () => {
    expect(pickRedirectUri({ ...cloud, GOOGLE_REDIRECT_URI: "http://localhost:3000/api/integrations/google/callback" }, "google"))
      .toBe("https://app.vercel.app/api/integrations/google/callback");
  });

  it("127.0.0.1 и ::1 тоже считаются локальными", () => {
    expect(pickBaseUrl({ ...cloud, APP_BASE_URL: "http://127.0.0.1:3000" })).toBe("https://app.vercel.app");
    expect(pickBaseUrl({ ...cloud, APP_BASE_URL: "http://[::1]:3000" })).toBe("https://app.vercel.app");
  });

  it("вне облака localhost остаётся рабочим значением", () => {
    expect(pickBaseUrl({ APP_BASE_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
  });

  it("боевой домен в APP_BASE_URL работает как прежде", () => {
    expect(pickBaseUrl({ ...cloud, APP_BASE_URL: "https://my.app" })).toBe("https://my.app");
  });
});
