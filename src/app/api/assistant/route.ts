import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { APP } from "@/config/app";
import { resolveAssistant, streamAssistant } from "@/lib/assistant/providers";

/**
 * AI-ассистент. Работает на сервере: ключи не попадают в клиент и не логируются.
 * Провайдер выбирается автоматически (бесплатные — в приоритете) или через
 * ASSISTANT_PROVIDER: ollama (локально, бесплатно) | gemini | groq | anthropic.
 * Ответ отдаётся потоково.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
  context: z.string().max(6000).optional(),
});

function systemPrompt(context: string | undefined): string {
  return [
    `Ты — дружелюбный ассистент внутри приложения «${APP.name}» — личной системы планирования`,
    "по методике «Фокус — Ресурс — Ритм». Помогаешь пользователю во всём: планировать день,",
    "формулировать задачи и цели, разбираться с приоритетами, распределять силы и деньги, а также",
    "просто поговорить на любую тему.",
    "",
    "Принципы методики, которых стоит придерживаться в советах:",
    "- не больше трёх активных крупных результатов одновременно (зона «Сейчас»);",
    "- у каждого активного плана есть ближайшее физическое действие;",
    "- на день — одно главное дело и не более двух дополнительных (плюс обязательные повторяющиеся);",
    "- по умолчанию 25% времени в резерве (диапазон 20–30%);",
    "- срочность сама по себе не отменяет важность;",
    "- перенос задачи — осознанное решение с причиной; система рекомендует, но решает пользователь.",
    "",
    "Отвечай кратко и по делу, на русском языке. Давай конкретные рекомендации и следующий шаг, а не",
    "длинные лекции. Не выводи служебные или системные теги в ответе.",
    context ? `\nТекущий контекст пользователя:\n${context}` : "",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const resolved = resolveAssistant();
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.reason }, { status: 503 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const system = systemPrompt(parsed.context);
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let any = false;
        for await (const chunk of streamAssistant(resolved, system, parsed.messages)) {
          any = true;
          controller.enqueue(encoder.encode(chunk));
        }
        if (!any) controller.enqueue(encoder.encode("(пустой ответ)"));
      } catch {
        const hint =
          resolved.provider === "ollama"
            ? "Не удалось связаться с Ollama. Установите его (ollama.com), выполните `ollama run llama3.2` и повторите — это бесплатный локальный вариант."
            : "Не удалось получить ответ. Проверьте ключ провайдера и повторите.";
        controller.enqueue(encoder.encode(`\n\n[${hint}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Assistant-Provider": resolved.provider,
    },
  });
}
