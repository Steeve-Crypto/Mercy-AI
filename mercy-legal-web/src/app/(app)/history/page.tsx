import Link from "next/link";
import { BookOpenText, Clock3, FileText, MessageSquareText, Plus, Search, ShieldCheck } from "lucide-react";

const sections = [
  {
    title: "Recent threads",
    description: "Assistant work will appear here after persistence is connected.",
    icon: MessageSquareText,
  },
  {
    title: "Matter-linked threads",
    description: "Matter name, workflow type, reliability status, and summary will be grouped here.",
    icon: FileText,
  },
  {
    title: "Drafting history",
    description: "Drafting and review requests will be available for attorney follow-up.",
    icon: FileText,
  },
  {
    title: "Research history",
    description: "D.C. source research and matter-linked retrieval runs will be listed here.",
    icon: Search,
  },
  {
    title: "Citation-checking history",
    description: "Citation checks, review flags, and reliability outcomes will appear here.",
    icon: ShieldCheck,
  },
  {
    title: "Saved outputs",
    description: "Saved work product will live here once backend thread persistence is connected.",
    icon: BookOpenText,
  },
] as const;

export default function HistoryPage() {
  return (
    <div className="space-y-5 p-5 lg:p-8">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#4338CA]">
              <Clock3 className="size-4" />
              History / Threads
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">Assistant work history</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Legal work history should stay tied to matters, workflows, reliability review, and saved outputs. This page is ready for persisted threads without inventing stored data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/chat" className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA]">
              <MessageSquareText className="size-4" />
              Start new request
            </Link>
            <Link href="/intake" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Plus className="size-4" />
              Create new matter
            </Link>
            <Link href="/templates" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <BookOpenText className="size-4" />
              Open templates
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
          <Clock3 className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-950">Your Assistant history will appear here after drafting, research, review, or citation-checking work.</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Thread persistence is intentionally not mocked in this pass. Once connected, each item should show matter name, workflow type, timestamp, reliability status, short summary, and Reopen / Continue / View actions.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <article key={section.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-[#4F46E5]">
                <section.icon className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-950">{section.title}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">{section.description}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
