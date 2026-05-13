"use client";

import { ChangeEvent, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type UploadDropzoneProps = {
  disabled?: boolean;
  onUpload: (file: File, documentText?: string) => Promise<void>;
};

export function UploadDropzone({ disabled = false, onUpload }: UploadDropzoneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [busy, setBusy] = useState(false);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function submitUpload() {
    if (!file) {
      return;
    }
    setBusy(true);
    await onUpload(file, documentText || undefined);
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-dashed bg-[#fbfcfe] p-5">
      <div className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
          <UploadCloud className="size-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-mercy-navy">Upload a matter PDF</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Uploads go directly to `/v1/workspace/discovery/upload` for the selected matter. Optional text helps the core when a PDF is scanned.
          </p>
          <div className="mt-4 grid gap-3">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFile}
              disabled={disabled || busy}
              className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-mercy-navy file:px-3 file:py-2 file:text-xs file:font-medium file:text-white"
            />
            <textarea
              value={documentText}
              onChange={(event) => setDocumentText(event.target.value)}
              placeholder="Optional document text or summary for scanned PDFs"
              disabled={disabled || busy}
              className="min-h-16 rounded-md border bg-white px-3 py-2 text-xs text-mercy-navy outline-none focus:ring-2 focus:ring-ring"
            />
            {busy && <Progress value={70} />}
            <Button variant="outline" size="sm" disabled={disabled || busy || !file} onClick={submitUpload}>
              {busy ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              Analyze upload
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
