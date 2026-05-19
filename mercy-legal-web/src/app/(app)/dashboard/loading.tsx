export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="h-8 w-64 animate-pulse rounded-md bg-slate-200" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

