import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "W.A.R.D.",
  description: "Personal daily loop: plan, focus, shut down.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
