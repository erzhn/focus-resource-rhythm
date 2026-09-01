"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Ловушка фокуса для модальных окон.
 *
 * Механика намеренно не на «первый/последний элемент»: браузер умеет фокусировать
 * и то, что не попадает в селектор (например, скроллируемые контейнеры в Chrome),
 * и фокус утекал наружу. Поэтому слушаем focusin на документе и возвращаем фокус
 * внутрь, если он ушёл за пределы диалога.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean, onClose: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = node?.querySelector<HTMLElement>("[autofocus]") ?? focusables()[0];
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    let shiftPressed = false;
    const trackShiftDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") shiftPressed = e.shiftKey;
    };

    // Возврат фокуса внутрь, если он покинул диалог (Tab, Shift+Tab или клик).
    const onFocusIn = (e: FocusEvent) => {
      if (!node) return;
      const target = e.target as Node | null;
      if (target && node.contains(target)) return;
      const list = focusables();
      if (list.length === 0) return;
      // Shift+Tab уводит назад — возвращаем на последний, иначе на первый.
      (shiftPressed ? list[list.length - 1] : list[0]).focus();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keydown", trackShiftDown, true);
    document.addEventListener("focusin", onFocusIn);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", trackShiftDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [active, onClose]);

  return ref;
}
