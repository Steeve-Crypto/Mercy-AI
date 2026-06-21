"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, CheckCircle2, Loader2, Scale, UserRound } from "lucide-react";
import { submitFullMatterIntake, type CoreFullMatterIntakeEnvelope } from "@/lib/core-client";

type IntakeWizardPageProps = {
  initialMatterId?: string;
};

type IntakeState = {
  clientName: string;
  clientContact: string;
  clientRole: string;
  matterTitle: string;
  practiceArea: string;
  jurisdiction: string;
  description: string;
  deadlines: string;
  parties: string;
  conflictChecked: boolean;
  noKnownConflict: boolean;
  scopeReviewed: boolean;
  attorneyReviewAcknowledged: boolean;
  confidentialMatter: boolean;
};

const initialState: IntakeState = {
  clientName: "",
  clientContact: "",
  clientRole: "client",
  matterTitle: "",
  practiceArea: "contract review",
  jurisdiction: "District of Columbia",
  description: "",
  deadlines: "",
  parties: "",
  conflictChecked: false,
  noKnownConflict: false,
  scopeReviewed: false,
  attorneyReviewAcknowledged: false,
  confidentialMatter: true,
};

const steps = [
  { label: "Client", description: "Name, contact, role" },
  { label: "Matter", description: "Facts, parties, deadlines" },
  { label: "Scope", description: "Conflict and warnings" },
  { label: "Review", description: "Create and continue" },
] as const;

function splitLines(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function deadlineRecords(value: string): Array<Record<string, string>> {
  return splitLines(value).map((item, index) => ({
    deadline_id: `intake-deadline-${index + 1}`,
    title: item,
    source: "client_intake",
  }));
}

export function IntakeWizardPage({ initialMatterId }: IntakeWizardPageProps) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<IntakeState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CoreFullMatterIntakeEnvelope | null>(null);

  const currentValidation = useMemo(() => validateStep(step, form), [form, step]);
  const matterDetailHref = created?.matter_id ? (`/matters/${encodeURIComponent(created.matter_id)}` as Route) : null;
  const chatHref = created?.matter_id ? (`/chat?matterId=${encodeURIComponent(created.matter_id)}` as Route) : null;

  useEffect(() => {
    setHydrated(true);
  }, []);

  function update<K extends keyof IntakeState>(key: K, value: IntakeState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function next() {
    const validation = validateStep(step, form);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function back() {
    setError(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateAll(form);
    if (validation) {
      setError(validation);
      return;
    }

    setBusy(true);
    setError(null);
    const response = await submitFullMatterIntake({
      matter_id: initialMatterId,
      client: {
        client_name: form.clientName,
        contact: form.clientContact,
        client_role: form.clientRole,
      },
      matter: {
        matter_name: form.matterTitle,
        matter_type: form.practiceArea,
        jurisdiction: form.jurisdiction,
        client_role: form.clientRole,
        opposing_parties: splitLines(form.parties),
      },
      facts: {
        summary: form.description,
        key_facts: {
          description: form.description,
          practice_area: form.practiceArea,
        },
      },
      deadlines: deadlineRecords(form.deadlines),
      documents: [],
      conflicts: {
        checked: form.conflictChecked,
        status: form.noKnownConflict ? "no_known_conflict_reported_by_user" : "needs_attorney_review",
        opposing_parties: splitLines(form.parties),
        warnings: form.noKnownConflict ? [] : ["Conflict review is incomplete or unresolved."],
      },
      scope: {
        confirmed: form.scopeReviewed,
        scope_of_work: form.practiceArea,
        excluded_work: ["final legal advice without attorney approval", "filing without attorney review"],
        client_responsibilities: ["verify facts", "provide complete documents", "approve final scope"],
        notes: form.scopeReviewed ? "Scope reviewed during guided intake." : "Scope requires attorney review.",
      },
      consent: {
        sensitivity_flags: form.confidentialMatter ? ["confidential_client_matter"] : [],
        attorney_review_acknowledged: form.attorneyReviewAcknowledged,
      },
      key_facts: {
        description: form.description,
        client_contact: form.clientContact,
      },
      requested_relief: form.practiceArea,
      opposing_parties: splitLines(form.parties),
      sensitivity_flags: form.confidentialMatter ? ["confidential_client_matter"] : [],
      tier: "free",
    });
    setBusy(false);

    if (!response.ok || !response.data) {
      setError(response.error ?? "Mercy could not save this intake.");
      return;
    }

    setCreated(response.data);
    const matterPath = `/matters/${encodeURIComponent(response.data.matter_id)}` as Route;
    router.push(matterPath);
    window.setTimeout(() => {
      if (window.location.pathname !== matterPath) {
        window.location.assign(matterPath);
      }
    }, 250);
  }

  return (
      <div data-testid="intake-workspace-ready" data-ready={hydrated} className="p-5 lg:p-8">
        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4338CA]">Client intake</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">Guided D.C. matter intake</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Create a tenant-scoped matter with the context Agent X needs for research, drafting, document review, and attorney final review.
              </p>
            </div>
            {initialMatterId ? (
              <span className="w-fit rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-medium text-[#4338CA]">
                Updating existing matter
              </span>
            ) : (
              <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                New matter
              </span>
            )}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-2">
              {steps.map((item, index) => {
                const active = step === index;
                const done = step > index;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setStep(index)}
                    className={`flex w-full items-start gap-3 rounded-lg p-3 text-left transition ${
                      active ? "bg-[#EEF2FF] text-[#4338CA]" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      done ? "bg-emerald-100 text-emerald-700" : active ? "bg-white text-[#4338CA]" : "bg-slate-100 text-slate-500"
                    }`}>
                      {done ? <CheckCircle2 className="size-4" /> : index + 1}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className="mt-1 block text-xs text-slate-500">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Intake is saved through the shared Mercy core and returned as a matter context for Mercy.
            </div>
          </aside>

          <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {step === 0 ? <ClientStep form={form} update={update} /> : null}
            {step === 1 ? <MatterStep form={form} update={update} /> : null}
            {step === 2 ? <ScopeStep form={form} update={update} /> : null}
            {step === 3 ? <ReviewStep form={form} created={created} matterHref={matterDetailHref} chatHref={chatHref} /> : null}

            {error ? (
              <div className="mt-5 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={back}
                disabled={step === 0 || busy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                <ArrowLeft className="size-4" />
                Back
              </button>
              {step < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={next}
                  disabled={Boolean(currentValidation)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50"
                >
                  Continue
                  <ArrowRight className="size-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                  Create Matter & Start Draft
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
  );
}

function ClientStep({ form, update }: { form: IntakeState; update: <K extends keyof IntakeState>(key: K, value: IntakeState[K]) => void }) {
  return (
    <section>
      <StepHeading icon={<UserRound className="size-5" />} title="Client information" description="Capture who Mercy is assisting and the client role in this D.C. matter." />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Client name" required value={form.clientName} onChange={(value) => update("clientName", value)} />
        <Field label="Contact" value={form.clientContact} onChange={(value) => update("clientContact", value)} placeholder="Email, phone, or internal reference" />
        <Field label="Client role" required value={form.clientRole} onChange={(value) => update("clientRole", value)} placeholder="tenant, petitioner, contractor, business owner..." />
      </div>
    </section>
  );
}

function MatterStep({ form, update }: { form: IntakeState; update: <K extends keyof IntakeState>(key: K, value: IntakeState[K]) => void }) {
  return (
    <section>
      <StepHeading icon={<Scale className="size-5" />} title="Matter details" description="Define the matter, parties, deadlines, and D.C. context Mercy should use." />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Matter title" required value={form.matterTitle} onChange={(value) => update("matterTitle", value)} />
        <Field label="Practice area" required value={form.practiceArea} onChange={(value) => update("practiceArea", value)} placeholder="contract review, landlord-tenant, civil litigation..." />
        <Field label="Jurisdiction" required value={form.jurisdiction} onChange={(value) => update("jurisdiction", value)} />
        <Field label="Parties" value={form.parties} onChange={(value) => update("parties", value)} placeholder="Opposing parties, comma-separated" />
      </div>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Matter description
        <textarea
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
          className="mt-1 min-h-36 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#C7D2FE]"
          placeholder="Facts, posture, client goal, documents available, requested relief..."
        />
      </label>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Deadlines
        <textarea
          value={form.deadlines}
          onChange={(event) => update("deadlines", event.target.value)}
          className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#C7D2FE]"
          placeholder="One per line, e.g. Answer due May 30; hearing June 12"
        />
      </label>
    </section>
  );
}

function ScopeStep({ form, update }: { form: IntakeState; update: <K extends keyof IntakeState>(key: K, value: IntakeState[K]) => void }) {
  return (
    <section>
      <StepHeading icon={<AlertTriangle className="size-5" />} title="Scope and conflict check" description="Record the minimum safeguards before Mercy creates a matter context." />
      <div className="mt-6 space-y-3">
        <CheckField checked={form.conflictChecked} onChange={(value) => update("conflictChecked", value)} label="I have started a conflict check for this matter." />
        <CheckField checked={form.noKnownConflict} onChange={(value) => update("noKnownConflict", value)} label="No known conflict has been identified from the information currently available." />
        <CheckField checked={form.scopeReviewed} onChange={(value) => update("scopeReviewed", value)} label="The expected scope of work has been reviewed or will be reviewed by an attorney." />
        <CheckField checked={form.attorneyReviewAcknowledged} onChange={(value) => update("attorneyReviewAcknowledged", value)} label="I understand all Mercy output requires attorney review and citation/source verification." />
        <CheckField checked={form.confidentialMatter} onChange={(value) => update("confidentialMatter", value)} label="Treat this as a confidential client matter." />
      </div>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        Mercy does not clear conflicts or provide final legal advice. This intake creates structured context for attorney-supervised workflows.
      </div>
    </section>
  );
}

function ReviewStep({
  form,
  created,
  matterHref,
  chatHref,
}: {
  form: IntakeState;
  created: CoreFullMatterIntakeEnvelope | null;
  matterHref: Route | null;
  chatHref: Route | null;
}) {
  return (
    <section>
      <StepHeading icon={<CheckCircle2 className="size-5" />} title="Review and create" description="Confirm the matter context before saving it to the Mercy core." />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Summary label="Client" value={form.clientName} />
        <Summary label="Role" value={form.clientRole} />
        <Summary label="Matter" value={form.matterTitle} />
        <Summary label="Practice area" value={form.practiceArea} />
        <Summary label="Jurisdiction" value={form.jurisdiction} />
        <Summary label="Parties" value={form.parties || "Pending"} />
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-950">Matter description</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{form.description || "No description entered."}</p>
      </div>
      {created && matterHref && chatHref ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">Matter created: {created.intake_summary.matter_name}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={matterHref} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
              Open matter
            </Link>
            <Link href={chatHref} className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800">
              Open in Mercy
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StepHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">{icon}</div>
      <div>
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label} {required ? <span className="text-rose-600">*</span> : null}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#C7D2FE]"
      />
    </label>
  );
}

function CheckField({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1" />
      {label}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value || "Pending"}</p>
    </div>
  );
}

function validateStep(step: number, form: IntakeState): string | null {
  if (step === 0) {
    if (!form.clientName.trim()) return "Client name is required.";
    if (!form.clientRole.trim()) return "Client role is required.";
  }
  if (step === 1) {
    if (!form.matterTitle.trim()) return "Matter title is required.";
    if (!form.practiceArea.trim()) return "Practice area is required.";
    if (!form.jurisdiction.trim()) return "Jurisdiction is required.";
    if (!form.description.trim()) return "Matter description is required.";
  }
  if (step === 2) {
    if (!form.conflictChecked) return "Confirm that a conflict check has been started.";
    if (!form.scopeReviewed) return "Confirm that scope has been or will be reviewed by an attorney.";
    if (!form.attorneyReviewAcknowledged) return "Confirm attorney review and citation/source verification.";
  }
  return null;
}

function validateAll(form: IntakeState): string | null {
  for (let index = 0; index < steps.length - 1; index += 1) {
    const issue = validateStep(index, form);
    if (issue) return issue;
  }
  return null;
}
