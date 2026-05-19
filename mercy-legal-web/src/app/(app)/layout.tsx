import { AppSidebar } from "@/components/app/app-sidebar";

export default function AttorneyAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <AppSidebar />
      <main className="lg:pl-72">{children}</main>
    </div>
  );
}

