"use client";

import { useState } from "react";
import { FileText, FolderKanban, MoreHorizontal } from "lucide-react";
import { ReliabilityPanel } from "@/components/dashboard/reliability-panel";
import { UploadDropzone } from "@/components/dashboard/upload-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type CoreDiscoveryEnvelope, type CoreMatterContext, uploadDiscoveryDocument } from "@/lib/core-client";

type DocumentVaultProps = {
  matterContext?: CoreMatterContext | null;
  discoveryResult?: CoreDiscoveryEnvelope | null;
  onDiscovery: (result: CoreDiscoveryEnvelope) => void;
};

export function DocumentVault({ matterContext, discoveryResult, onDiscovery }: DocumentVaultProps) {
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File, documentText?: string) {
    if (!matterContext?.matter_id) {
      setError("Select a matter before uploading a document.");
      return;
    }
    setError(null);
    const response = await uploadDiscoveryDocument({
      file,
      document_text: documentText,
      matter_id: matterContext.matter_id,
    });
    if (!response.ok || !response.data) {
      setError(response.error ?? "Document upload failed.");
      return;
    }
    onDiscovery(response.data);
  }

  const matterDocuments = matterContext?.documents ?? [];
  const discoveredFacts = discoveryResult?.facts ? Object.entries(discoveryResult.facts).slice(0, 4) : [];

  return (
    <Card id="document-vault">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Document Vault</CardTitle>
            <CardDescription>Live matter documents and discovery upload analysis.</CardDescription>
          </div>
          <Button variant="outline" size="icon" aria-label="Document vault actions">
            <MoreHorizontal />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md border border-[#ead08a] bg-[#fff8e1] p-3 text-xs text-[#735b13]">{error}</div>}
        <UploadDropzone disabled={!matterContext} onUpload={handleUpload} />

        <div className="space-y-3">
          {matterDocuments.length ? (
            matterDocuments.map((document, index) => (
              <div key={String(document.document_id ?? document.title ?? index)} className="flex items-center justify-between gap-4 rounded-md border bg-[var(--mercy-card)] p-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-mercy-navy">
                    <FileText className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-mercy-navy">{String(document.title ?? document.name ?? `Document ${index + 1}`)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FolderKanban className="size-3.5" />
                      {matterContext?.name ?? "Matter pending"}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">{String(document.source ?? "matter")}</Badge>
              </div>
            ))
          ) : (
            <div className="rounded-md border bg-[var(--mercy-card)] p-4 text-sm text-muted-foreground">
              No documents are linked to the selected matter yet. Save intake documents or upload a PDF for analysis.
            </div>
          )}
        </div>

        {discoveredFacts.length ? (
          <div className="rounded-lg border bg-[var(--mercy-card)] p-4">
            <p className="text-sm font-semibold text-mercy-navy">Latest discovery facts</p>
            <div className="mt-3 space-y-2">
              {discoveredFacts.map(([key, value]) => (
                <div key={key} className="rounded-md bg-secondary/70 p-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-mercy-navy">{key}</span>: {String(value).slice(0, 220)}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {discoveryResult && (
          <ReliabilityPanel
            title="Upload reliability"
            envelope={discoveryResult.response_envelope}
            route={discoveryResult.route}
            citations={discoveryResult.citations}
          />
        )}
      </CardContent>
    </Card>
  );
}
