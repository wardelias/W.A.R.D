import { Nav } from "@/components/nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      <Nav />
      <main className="mx-auto max-w-xl px-4 pt-4 pb-28 md:pb-16">{children}</main>
    </div>
  );
}
