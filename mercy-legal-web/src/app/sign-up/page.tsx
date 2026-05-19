import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";

export default function SignUpPage() {
  return (
    <Suspense>
      <AuthShell mode="sign-up" />
    </Suspense>
  );
}
