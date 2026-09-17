"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { Card, CardTitle, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createLinkCode } from "@/app/(app)/settings/telegram-actions";

/**
 * Подключение Telegram-бота.
 *
 * Бот получает от Telegram только chat_id и не знает, чей это чат. Поэтому
 * привязка идёт через одноразовый код: здесь его получают, боту отправляют.
 */
export function TelegramCard({ botName }: { botName: string | null }) {
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    const res = await createLinkCode();
    setBusy(false);
    if (res.error) {
      toast.warning(res.error);
      return;
    }
    setCode(res.code ?? null);
    setCopied(false);
  };

  const command = code ? `/start ${code}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success("Команда скопирована");
    } catch {
      // Буфер обмена может быть недоступен — команда всё равно видна на экране.
      toast.info("Скопируйте команду вручную");
    }
  };

  return (
    <Card>
      <CardTitle className="flex items-center gap-1.5">
        <Send className="h-3.5 w-3.5" /> Telegram-бот
      </CardTitle>
      <p className="mt-2 text-sm text-muted">
        Записывайте расходы прямо в чате — «Такси 250» — и получайте итог дня командой{" "}
        <code className="rounded bg-surface-2 px-1">/today</code>.
      </p>

      {!code ? (
        <div className="mt-4">
          <Button size="sm" onClick={generate} disabled={busy}>
            {busy ? "Создаю…" : "Получить код привязки"}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <ol className="space-y-1.5 text-sm text-muted">
            <li>
              1. Откройте бота{" "}
              {botName ? (
                <a
                  href={`https://t.me/${botName}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-primary underline"
                >
                  @{botName}
                </a>
              ) : (
                <span className="font-medium">в Telegram</span>
              )}
            </li>
            <li>2. Отправьте ему команду ниже</li>
          </ol>

          <div className="flex items-center gap-2 rounded-[var(--r-sm)] bg-surface-2 p-3">
            <code className="min-w-0 flex-1 truncate font-mono text-sm">{command}</code>
            <button
              onClick={copy}
              aria-label="Скопировать команду"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            >
              {copied ? (
                <Check className="h-4 w-4 text-[var(--resource)]" />
              ) : (
                <Copy className="h-4 w-4 text-muted" />
              )}
            </button>
          </div>

          <p className="text-[11px] text-muted-2">
            Код одноразовый и действует 15 минут. Если не успели — получите новый.
          </p>
        </div>
      )}
    </Card>
  );
}
