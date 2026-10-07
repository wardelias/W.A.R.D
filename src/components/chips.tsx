"use client";

import { useId } from "react";
import { cx } from "@/components/ui";

export type ChipOption<V extends string> = { value: V; label: string };

/**
 * A row of single-choice text chips (a styled radio group). One tap to choose.
 */
export function Chips<V extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  className,
}: {
  legend: string;
  name?: string;
  options: ChipOption<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <fieldset className={cx("flex flex-wrap items-center gap-1.5", className)}>
      <legend className="sr-only">{legend}</legend>
      <span aria-hidden className="w-12 shrink-0 text-sm text-muted">
        {legend}
      </span>
      {options.map((o) => {
        const inputId = `${id}-${o.value || "none"}`;
        return (
          <label key={o.value} htmlFor={inputId} className="cursor-pointer">
            <input
              id={inputId}
              type="radio"
              name={name ?? id}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-9 items-center rounded-md border border-line px-2.5 text-sm text-muted peer-checked:border-fg peer-checked:font-semibold peer-checked:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
              {o.label}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
