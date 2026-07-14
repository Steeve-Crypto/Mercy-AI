import { AppSidebar } from "@/components/app/app-sidebar";
import { SessionProvider } from "@/components/auth/session-provider";

export default function AttorneyAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-[var(--mercy-bg)] text-[var(--mercy-fg)]">
        <AppSidebar />
        <main className="min-h-screen lg:pl-64">{children}</main>
      </div>
    </SessionProvider>
  );
}
