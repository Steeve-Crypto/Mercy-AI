import { IntakeWizardPage } from "@/components/app/pages/intake-wizard-page";

type IntakeRouteProps = {
  searchParams?: Promise<{
    matterId?: string;
  }>;
};

export default async function IntakeRoute({ searchParams }: IntakeRouteProps) {
  const params = await searchParams;
  return <IntakeWizardPage initialMatterId={params?.matterId} />;
}

