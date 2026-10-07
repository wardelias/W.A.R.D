import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { localTime } from "@/domain/day";
import { nextSlots } from "@/domain/slots";
import { UserText } from "@/components/ui";
import { formatDate, formatTimeRange } from "@/lib/format";
import { getContext } from "@/server/context";
import { busyOn, getBlock } from "@/server/services/blocks";
import { calendarStatus } from "@/server/services/calendar";
import { uuid } from "@/server/validation/common";
import { BlockActions } from "./block-actions";

export const metadata = { title: "Block · W.A.R.D." };

export default function BlockPage({ params }: PageProps<"/blocks/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <BlockDetail params={params} />
    </Suspense>
  );
}

async function BlockDetail({ params }: Pick<PageProps<"/blocks/[id]">, "params">) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await getContext();
  const block = await getBlock(ctx, id);
  if (!block) notFound();
  const tz = ctx.settings.timezone;
  const minutes = Math.round((block.endsAt.getTime() - block.startsAt.getTime()) / 60_000);
  const { busy, focus } = await busyOn(ctx, block.day, block.id);
  const [free] = nextSlots(
    {
      day: block.day,
      now: ctx.now,
      timeZone: tz,
      rollover: ctx.settings.day_rollover,
      windows: ctx.settings.focus_windows,
      busy,
      focusBlocks: block.kind === "focus" ? focus : [...focus],
      blockMin: minutes,
      breakMin: ctx.settings.break_min,
    },
    1,
  );
  const calendar = await calendarStatus(ctx);
  const label = block.kind === "focus" ? `Focus · ${block.title}` : block.title;

  return (
    <div>
      <Link href="/today" className="inline-flex min-h-11 items-center text-[15px] text-muted">
        ← Today
      </Link>
      <h1 className="mt-1 text-lg font-semibold">
        {block.kind === "focus" ? "Focus · " : ""}
        <UserText>{block.title}</UserText>
      </h1>
      <p className="mt-1 text-muted">
        {formatDate(block.day)} · {formatTimeRange(block.startsAt, block.endsAt, tz)} · W.A.R.D.
        {block.syncState !== "synced" ? " · not synced yet" : ""}
      </p>
      {block.taskId ? (
        <p className="mt-1 text-sm">
          <Link
            href={`/tasks/${block.taskId}?from=/blocks/${block.id}`}
            className="underline underline-offset-4"
          >
            Open the task
          </Link>
        </p>
      ) : null}
      {block.kind === "focus" && !block.goalId ? (
        <p className="mt-2 text-sm">Created in Google Calendar, so it has no goal yet.</p>
      ) : null}

      <BlockActions
        id={block.id}
        label={label}
        started={block.startsAt <= ctx.now}
        outcome={block.outcome}
        day={block.day}
        time={localTime(block.startsAt, tz)}
        currentText={`${formatDate(block.day)} ${formatTimeRange(block.startsAt, block.endsAt, tz)}`}
        nextFree={
          free
            ? { iso: free.start.toISOString(), text: formatTimeRange(free.start, free.end, tz) }
            : null
        }
        calendarName={calendar.connection ? "Google Calendar “W.A.R.D.”" : null}
        timeZone={tz}
        minutes={minutes}
      />
    </div>
  );
}
