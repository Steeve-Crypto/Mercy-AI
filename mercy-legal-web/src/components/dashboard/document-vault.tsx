import { FileText, FolderKanban, MoreHorizontal } from "lucide-react";
import { documents } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadDropzone } from "@/components/dashboard/upload-dropzone";

export function DocumentVault() {
  return (
    <Card id="document-vault">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Document Vault</CardTitle>
            <CardDescription>Organize, analyze, and retrieve documents across active matters.</CardDescription>
          </div>
          <Button variant="outline" size="icon" aria-label="Document vault actions">
            <MoreHorizontal />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <UploadDropzone />
        <div className="space-y-3">
          {documents.map((document) => (
            <div key={document.name} className="flex items-center justify-between gap-4 rounded-md border bg-white p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-mercy-navy">
                  <FileText className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-mercy-navy">{document.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FolderKanban className="size-3.5" />
                    {document.matter}
                  </p>
                </div>
              </div>
              <Badge variant={document.status === "Needs review" ? "risk" : "secondary"}>{document.status}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
