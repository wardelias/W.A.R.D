"use client";

import { useActionState } from "react";
import { Button, Label, Notice, TextField } from "@/components/ui";
import { loginStep, signInWithGoogle, type LoginState } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginStep, {
    step: "email",
    error: initialError,
  });

  if (state.step === "code") {
    return (
      <form action={action} className="space-y-4">
        <p className="text-[15px]">
          Code sent to <bdi>{state.email}</bdi>.
        </p>
        <input type="hidden" name="intent" value="verify" />
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="code">6-digit code</Label>
          <TextField
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            dir="ltr"
          />
        </div>
        {state.error ? <Notice>{state.error}</Notice> : null}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Checking…" : "Sign in"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => window.location.reload()}>
          Use a different email
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-8">
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="primary" className="w-full">
          Continue with Google
        </Button>
      </form>

      <form action={action} className="space-y-3">
        <input type="hidden" name="intent" value="send" />
        <p className="text-sm text-muted">or get a code by email</p>
        <div>
          <Label htmlFor="email">Email</Label>
          <TextField
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.email}
            dir="ltr"
          />
        </div>
        {state.error ? <Notice>{state.error}</Notice> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Send code"}
        </Button>
      </form>
    </div>
  );
}
