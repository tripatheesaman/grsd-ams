import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NAC Admin Dashboard",
  description: "NAC Admin Dashboard",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="nac-page-bg">{children}</body>
    </html>
  );
}
