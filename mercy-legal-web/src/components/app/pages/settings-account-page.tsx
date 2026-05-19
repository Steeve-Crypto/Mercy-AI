"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, HelpCircle, Palette, Save, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { useMercySession } from "@/components/auth/session-provider";

type ProfileDraft = {
  name: string;
  email: string;
  firm: string;
  dcBarNumber: string;
};

export function SettingsAccountPage() {
  const { session, loading, configured } = useMercySession();
  const initialProfile = useMemo<ProfileDraft>(
    () => ({
      name: session.name,
      email: session.email ?? "",
      firm: session.firm ?? "",
      dcBarNumber: session.dcBarNumber ?? "",
    }),
    [session.dcBarNumber, session.email, session.firm, session.name],
  );
  const [profile, setProfile] = useState(initialProfile);
  const [theme, setTheme] = useState<"system" | "light">("system");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  function saveProfile() {
    setMessage("Profile changes are staged locally. Backend profile persistence is not enabled for this beta environment yet.");
    window.setTimeout(() => setMessage(null), 4500);
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Account & Profile"
        description="Manage attorney identity, firm context, D.C. Bar details, and workspace preferences for Mercy Legal AI."
      >
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-medium text-[#4338CA]">
            {configured ? "Supabase Auth" : "Local dev session"}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            {session.roles.join(", ")}
          </span>
        </div>
      </PageHeader>

      <div className="space-y-6 p-5 lg:p-8">
        {message ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            {message}
          </div>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
                <UserRound className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Attorney profile</h2>
                <p className="text-sm text-slate-500">Used for workspace display and tenant-scoped request context.</p>
              </div>
            </div>

            {loading ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label="Name" value={profile.name} onChange={(value) => setProfile((current) => ({ ...current, name: value }))} />
                <Field label="Work email" type="email" value={profile.email} onChange={(value) => setProfile((current) => ({ ...current, email: value }))} />
                <Field label="Firm" value={profile.firm} placeholder="Firm or solo practice name" onChange={(value) => setProfile((current) => ({ ...current, firm: value }))} />
                <Field label="D.C. Bar number" value={profile.dcBarNumber} placeholder="Optional" onChange={(value) => setProfile((current) => ({ ...current, dcBarNumber: value }))} />
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={saveProfile}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA]"
              >
                <Save className="size-4" />
                Save profile
              </button>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <ShieldCheck className="size-4 text-[#4F46E5]" />
                Tenant context
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <Info label="Tenant" value={session.tenantId} />
                <Info label="User ID" value={session.userId} />
                <Info label="Auth mode" value={configured ? "Authenticated" : "Local development"} />
              </dl>
            </div>

            <div id="preferences" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Palette className="size-4 text-[#4F46E5]" />
                Appearance
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["system", "light"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTheme(option)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize ${
                      theme === option ? "border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div id="support" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <HelpCircle className="size-4 text-[#4F46E5]" />
                Help & Support
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                For beta support, include your tenant ID, matter ID if relevant, and whether Agent X produced a trace link.
              </p>
              <a className="mt-4 inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="mailto:support@mercy.ai">
                Email support
              </a>
            </div>
          </aside>
        </section>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#C7D2FE]"
      />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-all font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
