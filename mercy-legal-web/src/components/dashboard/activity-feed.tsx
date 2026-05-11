import { activity } from "@/lib/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ActivityFeed() {
  return (
    <Card id="activity">
      <CardHeader>
        <CardTitle>History / Activity</CardTitle>
        <CardDescription>Recent AI actions, uploads, and clause activity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activity.map((item) => (
          <div key={`${item.label}-${item.time}`} className="flex gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
              <item.icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 border-b pb-4 last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-mercy-navy">{item.label}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
