export default function MatterDetailLoading() {
  return (
    <div className="min-h-screen bg-slate-50 p-5 lg:p-8">
      <div className="h-8 w-72 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-96 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-96 animate-pulse rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}

