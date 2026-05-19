import { AppSidebar } from "@/components/app/app-sidebar";
import { SessionProvider } from "@/components/auth/session-provider";

export default function AttorneyAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <AppSidebar />
        <main className="lg:pl-72">{children}</main>
      </div>
    </SessionProvider>
  );
}
