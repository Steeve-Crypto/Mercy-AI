import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Mercy Legal AI | D.C. Attorney Workspace",
    template: "%s | Mercy Legal AI",
  },
  description:
    "A premium D.C.-focused legal AI workspace for solo attorneys and small firms—with matter context, citations, attorney review, and Microsoft Office integration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('mercy-theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
