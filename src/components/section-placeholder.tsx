import { Construction } from "lucide-react";
import { Card } from "@/components/ui/primitives";

/**
 * Честный плейсхолдер для разделов, реализованных на уровне схемы/логики,
 * но ещё не собранных в полный интерфейс. Не показывает «рабочие» кнопки-обманки.
 */
export function SectionPlaceholder({
  title,
  description,
  planned,
}: {
  title: string;
  description: string;
  planned: string[];
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </header>
      <Card className="border-dashed">
        <div className="flex items-center gap-2 text-muted">
          <Construction className="h-4 w-4" />
          <span className="text-sm font-medium">Раздел в разработке</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          Доменная логика и схема данных для этого раздела заложены. Ниже — что здесь появится:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {planned.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
