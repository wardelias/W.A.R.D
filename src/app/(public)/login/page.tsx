import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · W.A.R.D." };

const ERRORS: Record<string, string> = {
  not_allowed: "That account isn't allowed to sign in.",
  google: "Google sign-in didn't finish. Try again.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">W.A.R.D.</h1>
      <Suspense fallback={null}>
        <LoginBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginBody({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const next = typeof params.next === "string" ? params.next : "";
  return <LoginForm next={next} initialError={errorKey ? ERRORS[errorKey] : undefined} />;
}
