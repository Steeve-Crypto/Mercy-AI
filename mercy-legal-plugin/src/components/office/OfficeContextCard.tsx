import { memo } from "react";
import { Badge, Button, Text } from "@fluentui/react-components";
import { ArrowSync24Regular, Document24Regular, Mail24Regular } from "@fluentui/react-icons";
import type { OfficeContentContext } from "../../services/office";

type OfficeContextCardProps = {
  context: OfficeContentContext | null;
  loading: boolean;
  onRefresh: () => void;
};

function modeLabel(context: OfficeContentContext): string {
  if (context.mode === "outlook-compose") return "Compose draft";
  if (context.mode === "outlook-read") return "Read-only email";
  if (context.mode === "word-document") return context.source === "word-selection" ? "Word selection" : "Word document";
  return "Preview";
}

export const OfficeContextCard = memo(function OfficeContextCard({ context, loading, onRefresh }: OfficeContextCardProps) {
  const isOutlook = context?.surface === "Outlook";
  return (
    <section className="officeContextCard" aria-label="Active Office context">
      <div className="sectionHeader contextHeader">
        <div className="contextTitle">
          {isOutlook ? <Mail24Regular /> : <Document24Regular />}
          <Text weight="semibold">Active context</Text>
        </div>
        <Button
          appearance="subtle"
          size="small"
          icon={<ArrowSync24Regular />}
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh active Office context"
        />
      </div>
      {context ? (
        <div className="contextBody">
          <div className="contextBadges">
            <Badge appearance="tint" color={context.canApply ? "success" : "informative"}>
              {modeLabel(context)}
            </Badge>
            <Badge appearance="outline">{context.source.replace(/-/g, " ")}</Badge>
          </div>
          {context.subject ? <Text className="contextSubject">{context.subject}</Text> : null}
          <dl className="contextDetails">
            {context.sender ? (
              <>
                <dt>From</dt>
                <dd>{context.sender}</dd>
              </>
            ) : null}
            {context.recipients.length ? (
              <>
                <dt>To</dt>
                <dd>{context.recipients.join(", ")}</dd>
              </>
            ) : null}
            {context.attachmentNames.length ? (
              <>
                <dt>Files</dt>
                <dd>{context.attachmentNames.join(", ")}</dd>
              </>
            ) : null}
          </dl>
          <Text className="contextPosture">
            {isOutlook
              ? "Mercy reads only the message context Outlook exposes. Attachment names are metadata; sending is never automated."
              : "Mercy uses the current selection when available and never changes the document without your approval."}
          </Text>
        </div>
      ) : (
        <div className="contextEmpty">{loading ? "Reading Office context…" : "Office context is unavailable. Refresh or reopen the item."}</div>
      )}
    </section>
  );
});
