import { AdminSidebar } from "@/components/app/admin-sidebar";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <AdminSidebar />
      <main className="lg:pl-72">{children}</main>
    </div>
  );
}

