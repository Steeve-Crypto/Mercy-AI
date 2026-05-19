import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";

export default function SignInPage() {
  return (
    <Suspense>
      <AuthShell mode="sign-in" />
    </Suspense>
  );
}
