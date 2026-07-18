import HeroSection from '@/components/landing/HeroSection';
import EmotionalHook from '@/components/landing/EmotionalHook';
import HowItWorks from '@/components/landing/HowItWorks';
import Comparison from '@/components/landing/Comparison';
import ProductShowcase from '@/components/landing/ProductShowcase';
import StoryFeatures from '@/components/landing/StoryFeatures';
import StatsFunnel from '@/components/landing/StatsFunnel';
import PricingSection from '@/components/landing/PricingSection';
import FAQ from '@/components/landing/FAQ';

export default function LandingPage() {
  return (
    <div>
      <HeroSection />
      <EmotionalHook />
      <HowItWorks />
      <ProductShowcase />
      <Comparison />
      
      <section style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'center' }}>
        <StoryFeatures />
        <StatsFunnel />
      </section>

      <PricingSection />
      <FAQ />
    </div>
  );
}
