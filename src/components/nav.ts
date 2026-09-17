import {
  BarChart3,
  CalendarDays,
  Home,
  ListChecks,
  Bell,
  Settings,
  Sparkles,
  Target,
  Gauge,
  Wallet,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Короткая подпись для нижней мобильной навигации. */
  short?: string;
  icon: LucideIcon;
  /** Показывать в нижней мобильной навигации (главные разделы). */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Сегодня", short: "Сегодня", icon: Home, primary: true },
  { href: "/assistant", label: "Ассистент", short: "Ассистент", icon: Sparkles },
  { href: "/plans", label: "Все планы", short: "Планы", icon: ListChecks, primary: true },
  { href: "/goals", label: "Цели и проекты", short: "Цели", icon: Target },
  { href: "/calendar", label: "Календарь", short: "Календарь", icon: CalendarDays, primary: true },
  { href: "/finance", label: "Деньги", short: "Деньги", icon: Wallet, primary: true },
  { href: "/resources", label: "Ресурсы", icon: Gauge },
  { href: "/stats", label: "Статистика", icon: BarChart3 },
  { href: "/reviews", label: "Сверки", icon: ClipboardCheck },
  { href: "/notifications", label: "Уведомления", icon: Bell },
  { href: "/settings", label: "Настройки", short: "Ещё", icon: Settings, primary: true },
];
