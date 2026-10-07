import Link from "next/link";
import { UserText } from "@/components/ui";
import { formatTimeRange } from "@/lib/format";
import type { AgendaItem } from "@/server/services/calendar";

/** The day's calendar as a plain list: time, title, where it lives. */
export function Agenda({ items, timeZone }: { items: AgendaItem[]; timeZone: string }) {
  if (items.length === 0) return <p className="text-muted">Nothing on the calendar.</p>;
  return (
    <ul>
      {items.map((item) => {
        const time = item.allDay ? "All day" : formatTimeRange(item.start!, item.end!, timeZone);
        const title =
          item.kind === "focus" ? (
            <>
              Focus · <UserText>{item.title}</UserText>
            </>
          ) : (
            <UserText>{item.title}</UserText>
          );
        const meta = [
          item.source,
          item.kind !== "event" && item.syncState !== "synced" ? "not synced yet" : null,
          item.outcome === "skipped" ? "skipped" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        const row = (
          <span className="flex items-baseline gap-3">
            <span className="w-[6.5rem] shrink-0 text-sm text-muted tabular-nums">{time}</span>
            <span className="min-w-0 flex-1">
              <span className="block break-words">{title}</span>
              <span className="block text-sm text-muted">{meta}</span>
            </span>
          </span>
        );
        return (
          <li key={`${item.kind}-${item.id}`} className="border-b border-line py-2">
            {item.kind === "event" ? (
              row
            ) : (
              <Link href={`/blocks/${item.id}`} className="block">
                {row}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
