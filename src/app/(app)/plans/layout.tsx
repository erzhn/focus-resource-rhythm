import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Все планы" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
