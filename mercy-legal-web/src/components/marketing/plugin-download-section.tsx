import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Download,
  FileSearch,
  MessageSquareText,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { AnimatedShell } from "@/components/marketing/animated-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pluginFeatures } from "@/lib/data";

export function PluginDownloadSection() {
  return (
    <section id="download" className="relative overflow-hidden bg-white px-6 py-24 lg:px-8">
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#f7f8fb] to-white" aria-hidden />
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <AnimatedShell>
          <Badge variant="gold">Microsoft Word plugin</Badge>
          <h2 className="mt-5 text-4xl font-semibold tracking-normal text-mercy-navy md:text-5xl">
            Download Mercy.ai for Word.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Bring DC-aware legal AI into the document where drafting happens: highlight risk, explain clauses, insert firm-approved language, and generate reports without leaving Word.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="gold" size="lg">
              <a href="/downloads/mercy-plugin-preview.txt" download>
                <Download />
                Download Plugin
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/sign-up">
                Create account
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {pluginFeatures.map((feature) => (
              <div key={feature} className="flex items-center gap-3 rounded-md border bg-[#fbfcfe] px-3 py-2 text-sm text-mercy-navy">
                <BadgeCheck className="size-4 text-[#a37f12]" />
                {feature}
              </div>
            ))}
          </div>
        </AnimatedShell>

        <AnimatedShell className="relative min-h-[520px]">
          <div className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#e6d080]/50 bg-[radial-gradient(circle,rgba(212,175,55,0.16),transparent_62%)]" />
          <div className="absolute left-8 top-5 w-[78%] rounded-lg border bg-white p-4 shadow-[0_30px_90px_rgba(10,20,40,0.16)]">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-mercy-navy">
                <span className="grid size-8 place-items-center rounded-md bg-[#2453a6] text-white">W</span>
                Lease Amendment.docx
              </div>
              <Badge variant="risk">4 risks</Badge>
            </div>
            <div className="mt-5 space-y-3 text-sm leading-7 text-[#34405a]">
              <p>
                Tenant shall indemnify Landlord from all claims arising from or relating to the premises,
                <span className="rounded bg-[#fff0ef] px-1 text-[#9b261d]"> including Landlord negligence</span>.
              </p>
              <p>
                Venue shall be determined by any court of competent jurisdiction.
                <span className="rounded bg-[#fff7dd] px-1 text-[#755a08]"> Add DC venue language</span>.
              </p>
            </div>
          </div>

          <div className="absolute bottom-8 right-0 w-[74%] rounded-lg border bg-mercy-navy p-5 text-white shadow-[0_30px_90px_rgba(10,20,40,0.25)]">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquareText className="size-4 text-[#f0d46a]" />
              Mercy.ai sidebar
            </div>
            <div className="mt-5 space-y-3">
              {[
                { icon: FileSearch, text: "Explain highlighted indemnity risk with DC context." },
                { icon: WandSparkles, text: "Insert narrower tenant-controlled acts language." },
                { icon: ShieldCheck, text: "Generate attorney review report into this document." },
              ].map((item) => (
                <div key={item.text} className="flex gap-3 rounded-md border border-white/10 bg-white/8 p-3 text-sm leading-6 text-white/76">
                  <item.icon className="mt-1 size-4 shrink-0 text-[#f0d46a]" />
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </AnimatedShell>
      </div>
    </section>
  );
}
