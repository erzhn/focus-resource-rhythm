/**
 * Категории операций.
 *
 * Иконки — из Lucide, а не эмодзи: в приложении единый набор иконок, эмодзи
 * выбиваются из него визуально и плохо читаются скринридером. Эмодзи-подпись
 * хранится отдельно — для текстовых отчётов и экспорта.
 */

export type TxKind = "expense" | "income" | "refund";

export type CategoryId =
  | "food" | "transport" | "shopping" | "fun" | "connectivity" | "education"
  | "home" | "tech" | "finance" | "gifts" | "health" | "other";

export interface Category {
  id: CategoryId;
  label: string;
  /** Имя иконки Lucide — резолвится в UI. */
  icon: string;
  emoji: string;
  /** CSS-переменная цвета. */
  color: string;
  /** Слова для автоопределения; сопоставляются по началу слова. */
  keywords: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: "food", label: "Еда и напитки", icon: "UtensilsCrossed", emoji: "🍔", color: "var(--attention)",
    keywords: ["еда", "обед", "ужин", "завтрак", "кафе", "ресторан", "кофе", "чай", "продукт", "магазин", "супермаркет", "доставка", "перекус", "пицц", "шаурма", "самса", "лепешк", "вода", "сок", "напит", "столов", "булочн", "пекарн", "мороженое", "фрукт", "овощ", "мясо", "хлеб", "молоко", "яйц", "бургер"],
  },
  {
    id: "transport", label: "Транспорт", icon: "Car", emoji: "🚕", color: "var(--zone-next)",
    keywords: ["такси", "taxi", "яндекс", "убер", "автобус", "маршрутк", "метро", "бензин", "топлив", "заправк", "парковк", "проезд", "каршеринг", "самокат"],
  },
  {
    id: "shopping", label: "Покупки", icon: "ShoppingBag", emoji: "🛍️", color: "var(--primary)",
    keywords: ["одежд", "обув", "футболк", "джинс", "куртк", "рубашк", "кроссовк", "носк", "сумк", "аксессуар", "часы", "очки", "парфюм", "космети"],
  },
  {
    id: "fun", label: "Развлечения", icon: "Gamepad2", emoji: "🎮", color: "var(--zone-later)",
    keywords: ["игр", "кино", "театр", "концерт", "боулинг", "бильярд", "клуб", "бар", "развлеч", "мероприят", "steam", "playstation", "xbox", "аттракцион", "караоке"],
  },
  {
    id: "connectivity", label: "Связь и подписки", icon: "Wifi", emoji: "📱", color: "var(--zone-next)",
    keywords: ["интернет", "связь", "мобильн", "подписк", "тариф", "пополнен", "megacom", "beeline", "netflix", "spotify", "youtube", "icloud", "хостинг", "домен", "vpn"],
  },
  {
    id: "education", label: "Учёба", icon: "GraduationCap", emoji: "🎓", color: "var(--primary)",
    keywords: ["книг", "курс", "учеб", "обучен", "семинар", "тренинг", "репетитор", "универ", "школ", "канцеляр", "тетрад", "лекц"],
  },
  {
    id: "home", label: "Дом", icon: "Home", emoji: "🏠", color: "var(--resource)",
    keywords: ["дом", "квартир", "аренд", "коммунал", "свет", "газ", "уборк", "ремонт", "мебел", "посуд", "порошок", "мыло", "полотенц"],
  },
  {
    id: "tech", label: "Техника", icon: "Laptop", emoji: "💻", color: "var(--primary)",
    keywords: ["техник", "ноутбук", "компьютер", "монитор", "клавиатур", "мышк", "телефон", "наушник", "зарядк", "кабел", "флешк", "принтер", "электроник", "комплектующ"],
  },
  {
    id: "finance", label: "Финансы", icon: "Landmark", emoji: "💰", color: "var(--zone-declined)",
    keywords: ["комисс", "банк", "страхов", "налог", "штраф", "кредит", "процент"],
  },
  {
    id: "gifts", label: "Подарки", icon: "Gift", emoji: "❤️", color: "var(--danger)",
    keywords: ["подар", "цвет", "букет", "сувенир", "открытк"],
  },
  {
    id: "health", label: "Здоровье", icon: "HeartPulse", emoji: "🏥", color: "var(--resource)",
    keywords: ["здоров", "аптек", "лекарств", "врач", "больниц", "клиник", "анализ", "стоматолог", "витамин", "массаж", "спортзал", "фитнес"],
  },
  {
    id: "other", label: "Другое", icon: "Receipt", emoji: "🧾", color: "var(--muted)",
    keywords: [],
  },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Слова, означающие поступление денег. */
export const INCOME_KEYWORDS = [
  "зарплат", "зп", "стипенди", "аванс", "подработк", "преми", "бонус",
  "поступлен", "доход", "выплат", "гонорар", "кэшбэк", "кешбэк",
];

/** Слова, означающие возврат ранее потраченного (не новый доход). */
export const REFUND_KEYWORDS = ["возврат", "вернул", "рефанд", "refund", "компенсац"];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();

/** Буква ли символ — без привязки к алфавиту: у букв различается регистр. */
const isLetter = (ch: string) => ch.toLowerCase() !== ch.toUpperCase();

/**
 * Совпадение по НАЧАЛУ слова: «такси» находит «таксист», но не «шотакси».
 * Сделано перебором, а не регулярным выражением: не нужно экранировать
 * пользовательский ввод, а значит нет и целого класса ошибок с ним.
 */
function startsWordIn(text: string, key: string): boolean {
  let i = text.indexOf(key);
  while (i !== -1) {
    if (i === 0 || !isLetter(text[i - 1])) return true;
    i = text.indexOf(key, i + 1);
  }
  return false;
}

function hasKeyword(text: string, keywords: string[]): boolean {
  const t = norm(text);
  return keywords.some((k) => {
    const key = norm(k);
    // Ключи из нескольких слов ищем как подстроку целиком.
    return key.includes(" ") ? t.includes(key) : startsWordIn(t, key);
  });
}

/** Тип операции по описанию. Возврат проверяем раньше дохода. */
export function detectKind(description: string): TxKind {
  if (hasKeyword(description, REFUND_KEYWORDS)) return "refund";
  if (hasKeyword(description, INCOME_KEYWORDS)) return "income";
  return "expense";
}

/**
 * Категория по описанию. Возвращает null, если уверенного совпадения нет —
 * тогда интерфейс спрашивает у пользователя, а не придумывает молча.
 */
export function detectCategory(description: string): CategoryId | null {
  for (const c of CATEGORIES) {
    if (c.keywords.length > 0 && hasKeyword(description, c.keywords)) return c.id;
  }
  return null;
}
