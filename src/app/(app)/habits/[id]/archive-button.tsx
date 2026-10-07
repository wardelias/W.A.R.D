"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { archiveHabitAction } from "@/server/actions/habits";

export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await archiveHabitAction(id, !archived);
            if (!result.ok) setError(result.error);
            else if (!archived) router.push("/habits");
          })
        }
      >
        {archived ? "Restore" : "Archive"}
      </Button>
      {error ? <p className="text-sm">{error}</p> : null}
    </>
  );
}
