import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function PageHeader({ eyebrow = "Mercy Legal AI", title, description, children }: PageHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white/80 px-5 py-5 backdrop-blur lg:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4F46E5]">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {children}
      </div>
    </header>
  );
}

