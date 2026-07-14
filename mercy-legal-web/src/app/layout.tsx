import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mercy.ai | AI Legal Assistant for DC Small Firms",
  description:
    "A premium AI legal workspace for Washington DC solo attorneys and small law firms.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
