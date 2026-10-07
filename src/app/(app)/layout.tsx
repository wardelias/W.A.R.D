import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { NavList } from "@/components/nav-list";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<NavList pathname={null} />}>
        <Nav />
      </Suspense>
      <main className="mx-auto max-w-xl px-4 pt-4 pb-28 md:pb-16">{children}</main>
    </div>
  );
}
