import { memo } from "react";
import { Button, Text } from "@fluentui/react-components";
import { Copy24Regular, Edit24Regular } from "@fluentui/react-icons";

type ApprovalActionsProps = {
  surface: "Word" | "Outlook" | "Office";
  applyLabel?: string;
  canApply: boolean;
  busy: boolean;
  onApply: () => void;
  onCopy: () => void;
};

export const ApprovalActions = memo(function ApprovalActions({
  surface,
  applyLabel,
  canApply,
  busy,
  onApply,
  onCopy
}: ApprovalActionsProps) {
  return (
    <div className="approvalPanel" aria-label="Attorney approval actions">
      <Text className="approvalCopy">
        {applyLabel
          ? surface === "Outlook"
            ? "Preview only. Writing changes the open draft only after you approve; Mercy never sends email."
            : "Preview only. Mercy changes the document only after you approve this exact output."
          : "Copy this output for attorney review. No Office content will be changed."}
      </Text>
      <div className="approvalButtons">
        <Button appearance="secondary" size="small" icon={<Copy24Regular />} onClick={onCopy} disabled={busy}>
          Copy
        </Button>
        {applyLabel ? (
          <Button appearance="primary" size="small" icon={<Edit24Regular />} onClick={onApply} disabled={busy || !canApply}>
            {applyLabel}
          </Button>
        ) : null}
      </div>
      {applyLabel && !canApply ? (
        <Text className="approvalUnavailable" role="status">
          {surface === "Outlook" ? "Open a reply or compose window to write this output to a draft." : "Document editing is unavailable in this host."}
        </Text>
      ) : null}
    </div>
  );
});
