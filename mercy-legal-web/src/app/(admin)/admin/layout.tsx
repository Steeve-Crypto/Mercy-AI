import { AdminSidebar } from "@/components/app/admin-sidebar";
import { SessionProvider } from "@/components/auth/session-provider";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-slate-100 text-slate-950">
        <AdminSidebar />
        <main className="lg:pl-72">{children}</main>
      </div>
    </SessionProvider>
  );
}
