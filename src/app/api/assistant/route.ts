import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { APP } from "@/config/app";
import { assistantModel } from "@/lib/env";

/**
 * AI-ассистент на Claude (Anthropic). Работает на сервере: ключ ANTHROPIC_API_KEY
 * не попадает в клиент и не логируется. Ответ отдаётся потоково (streaming).
 * Ассистент видит краткий контекст планирования пользователя, чтобы помогать по
 * методике «Фокус — Ресурс — Ритм», но может обсуждать и любые темы.
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
  /** Краткий контекст планирования (строка, собранная на клиенте). */
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
    "длинные лекции. Не выводи служебные или системные XML-теги в ответе.",
    context ? `\nТекущий контекст пользователя:\n${context}` : "",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "AI-ассистент не настроен. Добавьте ANTHROPIC_API_KEY в .env.local (ключ из console.anthropic.com) и перезапустите приложение.",
      },
      { status: 503 },
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream({
      model: assistantModel,
      max_tokens: 2048,
      // Чат-ассистент: без «размышлений» ради быстрого ответа.
      thinking: { type: "disabled" },
      output_config: { effort: "medium" },
      system: systemPrompt(parsed.context),
      messages: parsed.messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch {
          controller.enqueue(encoder.encode("\n\n[Ошибка потока ответа]"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // Не раскрываем внутренние детали/секреты.
    return NextResponse.json(
      { error: "Не удалось получить ответ ассистента. Проверьте ключ и повторите." },
      { status: 502 },
    );
  }
}
