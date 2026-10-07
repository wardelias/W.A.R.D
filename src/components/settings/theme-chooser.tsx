"use client";

import { useState, useTransition } from "react";
import { Chips } from "@/components/chips";
import { saveThemeAction } from "@/server/actions/settings";

type Theme = "system" | "light" | "dark";

export function ThemeChooser({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [, startTransition] = useTransition();
  return (
    <Chips<Theme>
      legend="Theme"
      options={[
        { value: "system", label: "System" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
      value={theme}
      onChange={(next) => {
        setTheme(next);
        if (next === "system") document.documentElement.removeAttribute("data-theme");
        else document.documentElement.setAttribute("data-theme", next);
        startTransition(async () => {
          await saveThemeAction(next);
        });
      }}
    />
  );
}
