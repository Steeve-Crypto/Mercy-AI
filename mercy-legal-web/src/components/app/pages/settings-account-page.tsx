"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, HelpCircle, Loader2, MailPlus, Palette, Save, ShieldCheck, UsersRound, UserRound, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { useMercySession } from "@/components/auth/session-provider";
import {
  getFirmSeats,
  getUserProfile,
  inviteFirmSeat,
  updateUserProfile,
  type CoreFirmSeat,
} from "@/lib/core-client";

type ProfileDraft = {
  name: string;
  email: string;
  firm: string;
  dcBarNumber: string;
  role: string;
};

type Toast = {
  id: string;
  tone: "success" | "error" | "info";
  message: string;
};

export function SettingsAccountPage() {
  const { session, loading, configured } = useMercySession();
  const initialProfile = useMemo<ProfileDraft>(
    () => ({
      name: session.name,
      email: session.email ?? "",
      firm: session.firm ?? "",
      dcBarNumber: session.dcBarNumber ?? "",
      role: session.roles[0] ?? "attorney",
    }),
    [session.dcBarNumber, session.email, session.firm, session.name, session.roles],
  );
  const [profile, setProfile] = useState(initialProfile);
  const [theme, setTheme] = useState<"system" | "light">("system");
  const [saving, setSaving] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seats, setSeats] = useState<CoreFirmSeat[]>([]);
  const [seatTotal, setSeatTotal] = useState(1);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("attorney");
  const [inviting, setInviting] = useState(false);
  const isAdmin = session.roles.some((role) => ["admin", "platform_admin", "firm_admin", "ops"].includes(role));

  useEffect(() => {
    if (!profileLoaded) {
      setProfile(initialProfile);
    }
  }, [initialProfile, profileLoaded]);

  useEffect(() => {
    let mounted = true;
    getUserProfile().then((response) => {
      if (!mounted) return;
      if (response.ok && response.data) {
        setProfile({
          name: response.data.name ?? initialProfile.name,
          email: response.data.email ?? initialProfile.email,
          firm: response.data.firm_name ?? initialProfile.firm,
          dcBarNumber: response.data.dc_bar_number ?? initialProfile.dcBarNumber,
          role: response.data.role ?? initialProfile.role,
        });
        setProfileLoaded(true);
      }
    });

    if (isAdmin) {
      getFirmSeats().then((response) => {
        if (!mounted) return;
        if (response.ok && response.data) {
          setSeats(response.data.seats);
          setSeatTotal(response.data.total);
          setSeatError(null);
        } else {
          setSeatError(response.error ?? "Firm-seat endpoint is not available yet.");
          setSeats([
            {
              user_id: session.userId,
              name: session.name,
              email: session.email ?? "current-user@local",
              role: session.roles[0] ?? "admin",
              status: "active",
            },
          ]);
          setSeatTotal(3);
        }
      });
    }

    return () => {
      mounted = false;
    };
  }, [initialProfile.dcBarNumber, initialProfile.email, initialProfile.firm, initialProfile.name, initialProfile.role, isAdmin, session.email, session.name, session.roles, session.userId]);

  function addToast(tone: Toast["tone"], message: string) {
    const toast = { id: crypto.randomUUID(), tone, message };
    setToasts((current) => [toast, ...current].slice(0, 4));
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 4500);
  }

  function validateProfile() {
    if (!profile.name.trim()) return "Name is required.";
    if (!profile.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) return "Enter a valid work email.";
    if (profile.dcBarNumber && !/^[A-Za-z0-9-]{3,30}$/.test(profile.dcBarNumber)) return "D.C. Bar number can use letters, numbers, and hyphens.";
    return null;
  }

  async function saveProfile() {
    const validationError = validateProfile();
    if (validationError) {
      addToast("error", validationError);
      return;
    }
    setSaving(true);
    const response = await updateUserProfile({
      name: profile.name,
      email: profile.email,
      firm_name: profile.firm,
      dc_bar_number: profile.dcBarNumber,
      role: profile.role,
      preferences: { theme },
    });
    setSaving(false);

    if (!response.ok) {
      addToast("info", `${response.error ?? "Profile endpoint is not available yet."} Changes remain visible locally for this session.`);
      return;
    }

    addToast("success", "Profile saved.");
  }

  async function inviteSeat() {
    if (!inviteEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      addToast("error", "Enter a valid email address to invite.");
      return;
    }
    setInviting(true);
    const response = await inviteFirmSeat({ email: inviteEmail, role: inviteRole });
    setInviting(false);
    if (!response.ok || !response.data) {
      setSeats((current) => [
        ...current,
        { user_id: `invite-${inviteEmail}`, email: inviteEmail, role: inviteRole, status: "invited" },
      ]);
      addToast("info", `${response.error ?? "Seat invite endpoint is not available yet."} Invite is shown as a placeholder.`);
      setInviteEmail("");
      return;
    }
    setSeats(response.data.seats);
    setSeatTotal(response.data.total);
    setInviteEmail("");
    addToast("success", "Firm seat invitation sent.");
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
        {toasts.length ? (
          <div className="fixed right-5 top-5 z-50 w-80 space-y-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`flex items-start justify-between gap-3 rounded-xl border bg-white p-4 text-sm shadow-lg ${
                  toast.tone === "success"
                    ? "border-emerald-200 text-emerald-800"
                    : toast.tone === "error"
                      ? "border-rose-200 text-rose-800"
                      : "border-[#C7D2FE] text-[#4338CA]"
                }`}
              >
                <span className="flex items-start gap-2">
                  {toast.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : null}
                  {toast.message}
                </span>
                <button onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>
                  <X className="size-4" />
                </button>
              </div>
            ))}
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
                <Field label="Role" value={profile.role} placeholder="attorney" onChange={(value) => setProfile((current) => ({ ...current, role: value }))} />
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={saveProfile}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saving ? "Saving..." : "Save profile"}
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

        {isAdmin ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                  <UsersRound className="size-5 text-[#4F46E5]" />
                  Firm-seat management
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {seats.length} of {seatTotal} seats used. Invite status is tenant-scoped and admin-only.
                </p>
              </div>
              {seatError ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                  Backend invite endpoint pending
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto]">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="attorney@firm.com"
                className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#C7D2FE]"
              />
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
                className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#C7D2FE]"
              >
                <option value="attorney">Attorney</option>
                <option value="paralegal">Paralegal</option>
                <option value="firm_admin">Firm admin</option>
              </select>
              <button
                type="button"
                onClick={inviteSeat}
                disabled={inviting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60"
              >
                {inviting ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />}
                Invite
              </button>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[1fr_0.5fr_0.5fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>User</span>
                <span>Role</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-slate-200">
                {seats.map((seat) => (
                  <div key={seat.user_id} className="grid grid-cols-1 gap-2 px-4 py-4 text-sm md:grid-cols-[1fr_0.5fr_0.5fr] md:items-center">
                    <div>
                      <p className="font-semibold text-slate-950">{seat.name ?? seat.email}</p>
                      <p className="text-xs text-slate-500">{seat.email}</p>
                    </div>
                    <span className="text-slate-600">{seat.role}</span>
                    <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{seat.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
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
