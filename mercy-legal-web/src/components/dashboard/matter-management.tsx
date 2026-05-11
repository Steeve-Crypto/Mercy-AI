import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import { matters } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MatterManagement() {
  return (
    <Card id="matters">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Matter Management</CardTitle>
            <CardDescription>Simple client and matter tracking connected to the AI workspace.</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            View all
            <ArrowRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {matters.map((matter) => (
          <div key={matter.client} className="grid gap-4 rounded-md border bg-white p-4 md:grid-cols-[1fr_0.8fr_auto] md:items-center">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-mercy-navy">
                <BriefcaseBusiness className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-mercy-navy">{matter.client}</p>
                <p className="mt-1 text-xs text-muted-foreground">{matter.matter}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{matter.next}</p>
            <Badge variant="secondary">{matter.status}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
