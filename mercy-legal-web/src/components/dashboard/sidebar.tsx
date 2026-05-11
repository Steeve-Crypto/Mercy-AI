import Link from "next/link";
import { ArrowLeft, BadgeCheck, ChevronRight, Scale } from "lucide-react";
import { navItems } from "@/lib/data";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/10 bg-mercy-navy text-white lg:block">
      <div className="navy-grid absolute inset-0 opacity-50" aria-hidden />
      <div className="relative flex h-full flex-col p-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-white text-mercy-navy">
            <Scale className="size-5" />
          </span>
          <div>
            <p className="text-lg font-semibold">Mercy.ai</p>
            <p className="text-xs text-white/52">Small firm legal AI</p>
          </div>
        </Link>

        <nav className="mt-8 space-y-1">
          {navItems.map((item, index) => (
            <a
              key={item.label}
              href={`#${item.label.toLowerCase().replaceAll(" ", "-")}`}
              className={`group flex items-center justify-between rounded-md px-3 py-2.5 text-sm transition ${index === 0 ? "bg-white text-mercy-navy" : "text-white/68 hover:bg-white/8 hover:text-white"}`}
            >
              <span className="flex items-center gap-3">
                <item.icon className="size-4" />
                {item.label}
              </span>
              <ChevronRight className="size-4 opacity-0 transition group-hover:opacity-100" />
            </a>
          ))}
        </nav>

        <div className="mt-auto rounded-lg border border-white/10 bg-white/8 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BadgeCheck className="size-4 text-[#f0d46a]" />
            Firm readiness
          </div>
          <p className="mt-3 text-xs leading-5 text-white/60">
            Vault encryption, matter isolation, and attorney review workflows are active.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4 w-full border-white/18 bg-white/8 text-white hover:bg-white/14">
            <Link href="/">
              <ArrowLeft />
              Marketing site
            </Link>
          </Button>
        </div>
      </div>
    </aside>
  );
}
