/**
 * Presentation helpers for solo vs firm workspace context.
 * Authorization remains server-owned; these helpers only shape UI labels.
 */

export type WorkspaceAccountKind = "solo" | "firm" | "platform";

export type WorkspacePresentation = {
  accountKind: WorkspaceAccountKind;
  isFirm: boolean;
  isSolo: boolean;
  isPlatformAdmin: boolean;
  isFirmAdmin: boolean;
  label: string;
  scopeLabel: string;
  showTeamManagement: boolean;
  showPlatformAdminLink: boolean;
};

const PLATFORM_ROLES = new Set(["superadmin", "platform_admin", "ops"]);
const FIRM_ADMIN_ROLES = new Set(["admin", "firm_admin", "owner", "superadmin", "platform_admin", "ops"]);

export function workspacePresentation(input: {
  roles?: string[] | null;
  firmId?: string | null;
  firmName?: string | null;
  tenantId?: string | null;
}): WorkspacePresentation {
  const roles = (input.roles ?? []).map((role) => role.trim().toLowerCase()).filter(Boolean);
  const isPlatformAdmin = roles.some((role) => PLATFORM_ROLES.has(role));
  const isFirm = Boolean(input.firmId);
  const isFirmAdmin = isFirm && roles.some((role) => FIRM_ADMIN_ROLES.has(role));
  const accountKind: WorkspaceAccountKind = isPlatformAdmin ? "platform" : isFirm ? "firm" : "solo";

  return {
    accountKind,
    isFirm,
    isSolo: !isFirm,
    isPlatformAdmin,
    isFirmAdmin,
    label: isFirm
      ? input.firmName?.trim() || "Firm workspace"
      : "Solo practice",
    scopeLabel: isFirm
      ? `Firm · ${input.tenantId || "workspace"}`
      : `Solo · ${input.tenantId || "workspace"}`,
    showTeamManagement: isFirm && isFirmAdmin,
    showPlatformAdminLink: isPlatformAdmin,
  };
}
