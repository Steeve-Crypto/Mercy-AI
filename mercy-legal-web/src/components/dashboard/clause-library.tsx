"use client";

import { Copy, Search, WandSparkles } from "lucide-react";
import { clauses } from "@/lib/data";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ClauseLibrary() {
  const { selectedClause, setSelectedClause } = useAppStore();

  return (
    <Card id="clause-library">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>DC Clause Library</CardTitle>
            <CardDescription>Search clause language, explanations, and attorney notes.</CardDescription>
          </div>
          <Badge variant="gold">128 clauses</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search venue, leases, employment, payment..." />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-2">
            {clauses.map((clause) => (
              <button
                key={clause.title}
                onClick={() => setSelectedClause(clause.title)}
                className={`w-full rounded-md border p-3 text-left transition hover:border-[#d4af37] ${selectedClause === clause.title ? "border-[#d4af37] bg-[#fff9e8]" : "bg-white"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-mercy-navy">{clause.title}</p>
                  <Badge variant={clause.risk === "High" ? "risk" : "secondary"}>{clause.risk}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{clause.category}</p>
              </button>
            ))}
          </div>
          <div className="rounded-lg border bg-[#fbfcfe] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-mercy-navy">
              <WandSparkles className="size-4 text-[#b48b13]" />
              Interactive clause explainer
            </div>
            <h3 className="mt-5 text-xl font-semibold text-mercy-navy">{selectedClause}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This clause should identify the operative DC authority, explain enforceability pressure points, and give counsel a concise fallback position for negotiation.
            </p>
            <div className="mt-5 rounded-md border bg-white p-4 font-mono text-xs leading-6 text-[#34405a]">
              Venue shall lie exclusively in the courts located in the District of Columbia, unless federal jurisdiction is properly invoked.
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="gold" size="sm">
                <Copy />
                Copy
              </Button>
              <Button variant="outline" size="sm">Insert</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
