import { Sparkles } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6fa]">
      <div className="flex items-center gap-3 rounded-lg border bg-white px-5 py-4 shadow-[0_18px_60px_rgba(10,20,40,0.08)]">
        <Sparkles className="size-5 animate-pulse text-[#b48b13]" />
        <span className="text-sm font-medium text-mercy-navy">Preparing Mercy.ai workspace</span>
      </div>
    </div>
  );
}
