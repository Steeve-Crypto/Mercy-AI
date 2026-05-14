"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, FileText, Scale, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const steps = [
  {
    title: "Start with a D.C. template",
    detail: "Choose a practical workflow, then generate against the selected tenant matter.",
    icon: FileText,
  },
  {
    title: "Trust the reliability panel",
    detail: "Every live response shows route, confidence, citations, guardrails, and attorney-review status.",
    icon: ShieldCheck,
  },
  {
    title: "Verify before use",
    detail: "Mercy grounds work in official D.C. source metadata, but counsel must verify source text and filings.",
    icon: Scale,
  },
];

export function BetaOnboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const completed = window.localStorage.getItem("mercy.web.betaOnboardingComplete");
    setVisible(completed !== "true");
  }, []);

  function finish() {
    window.localStorage.setItem("mercy.web.betaOnboardingComplete", "true");
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  const active = steps[step];

  return (
    <section className="mb-5 rounded-lg border border-[#d9c27a] bg-white p-5 shadow-[0_16px_45px_rgba(10,20,40,0.05)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
            <active.icon className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="gold">Beta onboarding</Badge>
              <Badge variant="outline">
                Step {step + 1} of {steps.length}
              </Badge>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-mercy-navy">{active.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{active.detail}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              D.C. ethics reminder: confirm competence, confidentiality, citation accuracy, fee reasonableness, and client
              authorization before using AI-assisted work product.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="#template-gallery">Open gallery</a>
          </Button>
          {step < steps.length - 1 ? (
            <Button variant="gold" onClick={() => setStep((current) => current + 1)}>
              Next
              <ArrowRight />
            </Button>
          ) : (
            <Button variant="gold" onClick={finish}>
              <CheckCircle2 />
              Finish
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
