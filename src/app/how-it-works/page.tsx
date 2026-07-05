import { LandingNav } from "@/components/landing/LandingNav";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";

export default function HowItWorksPage() {
  return (
    <div className="relative min-h-screen bg-[#0b0d11] text-white">
      <LandingNav active="how-it-works" />
      <HowItWorksSection />
    </div>
  );
}
