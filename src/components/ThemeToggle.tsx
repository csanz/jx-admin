"use client";

import { useState } from "react";

/** Dark by default; light is remembered in a cookie the layout reads on the next request. */
export function ThemeToggle({ initial }: { initial: "dark" | "light" }) {
  const [theme, setTheme] = useState(initial);
  const next = theme === "dark" ? "light" : "dark";
  const flip = () => {
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to the ${next} theme`}
      title={`Switch to the ${next} theme`}
      className="px-2 py-1 text-xs text-text-subtle hover:text-text rounded cursor-pointer"
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
