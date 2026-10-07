import type { Metadata, Viewport } from "next";
import { HydrationMark } from "@/components/hydration-mark";
import { ServiceWorkerRegister } from "@/components/service-worker";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "W.A.R.D.",
  description: "Plan the day, focus, shut down.",
  appleWebApp: { capable: true, title: "W.A.R.D.", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111317" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
        <HydrationMark />
      </body>
    </html>
  );
}
