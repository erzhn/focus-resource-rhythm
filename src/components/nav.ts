import {
  BarChart3,
  CalendarDays,
  Home,
  ListChecks,
  Bell,
  Settings,
  Target,
  Wallet,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Показывать в нижней мобильной навигации (главные разделы). */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Сегодня", icon: Home, primary: true },
  { href: "/plans", label: "Все планы", icon: ListChecks, primary: true },
  { href: "/goals", label: "Цели и проекты", icon: Target, primary: true },
  { href: "/calendar", label: "Календарь", icon: CalendarDays, primary: true },
  { href: "/resources", label: "Ресурсы", icon: Wallet },
  { href: "/stats", label: "Статистика", icon: BarChart3 },
  { href: "/reviews", label: "Сверки", icon: ClipboardCheck },
  { href: "/notifications", label: "Уведомления", icon: Bell },
  { href: "/settings", label: "Настройки", icon: Settings, primary: true },
];
