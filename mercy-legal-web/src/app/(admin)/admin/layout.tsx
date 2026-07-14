import { AdminSidebar } from "@/components/app/admin-sidebar";
import { SessionProvider } from "@/components/auth/session-provider";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-[var(--mercy-bg)] text-[var(--mercy-fg)]">
        <AdminSidebar />
        <main className="min-h-screen lg:pl-72">{children}</main>
      </div>
    </SessionProvider>
  );
}
