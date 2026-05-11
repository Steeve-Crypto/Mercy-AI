import { AlertTriangle, FileSearch, Loader2 } from "lucide-react";
import { analysisBreakdown } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function ContractAnalyzer() {
  return (
    <Card id="contract-analyzer">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Contract Analyzer</CardTitle>
            <CardDescription>Risk scoring, issue breakdowns, and drafting recommendations.</CardDescription>
          </div>
          <Badge variant="risk">Risk 72</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-mercy-navy p-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-white/10">
                <Loader2 className="size-5 animate-spin text-[#f0d46a]" />
              </div>
              <div>
                <p className="text-sm font-medium">Analysis in progress</p>
                <p className="mt-1 text-xs text-white/58">Lease Amendment - Shaw Retail</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-[#f0d46a]">72%</span>
          </div>
          <Progress value={72} className="mt-5 bg-white/12" />
        </div>

        <div className="mt-5 space-y-3">
          {analysisBreakdown.map((item) => (
            <div key={item.label} className="rounded-md border bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="size-4 text-[#b48b13]" />
                  <p className="text-sm font-medium text-mercy-navy">{item.label}</p>
                </div>
                <Badge variant={item.tone === "High" ? "risk" : "secondary"}>{item.tone}</Badge>
              </div>
              <Progress value={item.score} className="mt-3 h-1.5" />
            </div>
          ))}
        </div>

        <Button className="mt-5 w-full" variant="outline">
          <FileSearch />
          Open full analysis
        </Button>
      </CardContent>
    </Card>
  );
}
