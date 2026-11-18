"use client";

import { useState } from "react";
import { RailIcon, railRow } from "./rail-row";

const SUN = "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0z";
const MOON = "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z";

/**
 * The portal's theme row (jx-portal LeftRail ThemeToggle): a rail row with the sun or moon and "Light mode" / "Dark
 * mode"; collapsed, the icon alone. Dark by default; light is remembered in a cookie the layout reads next request.
 */
export function ThemeToggle({ initial, collapsed = false }: { initial: "dark" | "light"; collapsed?: boolean }) {
  const [theme, setTheme] = useState(initial);
  const isDark = theme === "dark";
  const next = isDark ? "light" : "dark";
  const flip = () => {
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={flip}
      className={`${railRow(collapsed)} text-text-muted hover:text-text hover:bg-bg/60 transition-colors cursor-pointer`}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <span className="shrink-0">
        <RailIcon d={isDark ? SUN : MOON} />
      </span>
      {!collapsed && <span className="text-sm">{isDark ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
