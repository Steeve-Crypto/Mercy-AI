import { SignupSuccessClient } from "@/components/auth/signup-success-client";

export default async function SignupSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const checkoutSessionId = typeof sessionId === "string" && sessionId.startsWith("cs_") ? sessionId : null;
  return <SignupSuccessClient checkoutSessionId={checkoutSessionId} />;
}
