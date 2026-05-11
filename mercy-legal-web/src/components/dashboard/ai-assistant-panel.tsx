import { ArrowUp, Bot, CheckCircle2, Paperclip, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function AiAssistantPanel() {
  return (
    <Card id="assistant" className="overflow-hidden">
      <CardHeader className="border-b bg-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>AI Legal Assistant</CardTitle>
            <CardDescription>Ask across matters, documents, and DC-specific drafting context.</CardDescription>
          </div>
          <Badge variant="gold">Live context</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 bg-[#fbfcfe] p-5">
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mercy-navy text-white">
            <UserRound className="size-4" />
          </div>
          <div className="rounded-lg border bg-white p-4 text-sm leading-6 text-mercy-navy">
            Compare the indemnity language in the Shaw lease amendment against our preferred DC commercial lease position.
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
            <Bot className="size-4" />
          </div>
          <div className="flex-1 rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-sm leading-6 text-mercy-navy">
              The amendment creates a broader tenant indemnity than your preferred position. I would narrow it to claims arising from tenant-controlled acts, preserve landlord negligence carveouts, and add DC venue language.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {["3 source excerpts", "2 drafting options", "1 negotiation note"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs text-mercy-navy">
                  <CheckCircle2 className="size-3.5 text-[#9b740e]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <Textarea
            placeholder="Ask Mercy.ai to summarize, draft, compare, or explain..."
            className="min-h-20 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between border-t pt-3">
            <Button variant="ghost" size="sm">
              <Paperclip />
              Attach
            </Button>
            <Button variant="gold" size="sm">
              Send
              <ArrowUp />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
