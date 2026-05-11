import { AuthPaymentSection } from "@/components/marketing/auth-payment-section";
import { CtaSection } from "@/components/marketing/cta-section";
import { FeatureShowcase } from "@/components/marketing/feature-showcase";
import { HeroSection } from "@/components/marketing/hero-section";
import { PluginDownloadSection } from "@/components/marketing/plugin-download-section";
import { PricingSection } from "@/components/marketing/pricing-section";
import { Testimonials } from "@/components/marketing/testimonials";

export default function MarketingPage() {
  return (
    <main className="overflow-hidden">
      <HeroSection />
      <FeatureShowcase />
      <PluginDownloadSection />
      <AuthPaymentSection />
      <Testimonials />
      <PricingSection />
      <CtaSection />
    </main>
  );
}
