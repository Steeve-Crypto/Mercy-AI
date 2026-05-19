"use client";

export default function IntakeError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 p-5 lg:p-8">
      <div className="rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-rose-700">Intake failed to load</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Unable to open client intake</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {error.message || "Mercy could not load the guided intake workspace."}
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

