import { Sidebar } from "@/components/dashboard/sidebar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[#f4f6fa] text-mercy-navy">
      <Sidebar />
      <main className="lg:pl-72">{children}</main>
    </div>
  );
}
