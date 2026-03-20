import type { Metadata } from "next";
import "./globals.css";
import { withBasePath } from "@/lib/basePath";

export const metadata: Metadata = {
  title: "NAC Admin Dashboard",
  description: "NAC Admin Dashboard",
  icons: {
    icon: withBasePath("/favicon.png"),
    shortcut: withBasePath("/favicon.png"),
    apple: withBasePath("/favicon.png"),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="nac-page-bg">{children}</body>
    </html>
  );
}
