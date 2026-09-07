import { AutomationSkillSection } from './components/AutomationSkillSection';
import { FaqSection } from './components/FaqSection';
import { FinalCtaSection } from './components/FinalCtaSection';
import { Footer } from './components/Footer';
import { GallerySection } from './components/GallerySection';
import { Hero } from './components/Hero';
import { ModulesSection } from './components/ModulesSection';
import { Navbar } from './components/Navbar';
import { PricingSection } from './components/PricingSection';
import { ProblemSection } from './components/ProblemSection';
import { StatsBar } from './components/StatsBar';
import { StickyCta } from './components/StickyCta';
import { TestimonialsSection } from './components/TestimonialsSection';
import { VideoShowcaseSection } from './components/VideoShowcaseSection';
import { SoundBusProvider } from './hooks/useSoundBus';

export default function App() {
  return (
    <SoundBusProvider>
      <div className="relative min-h-screen bg-night">
        <Navbar />
        <main>
          <Hero />
          <StatsBar />
          <ProblemSection />
          <VideoShowcaseSection />
          <GallerySection />
          <AutomationSkillSection />
          <ModulesSection />
          <TestimonialsSection />
          <PricingSection />
          <FaqSection />
          <FinalCtaSection />
        </main>
        <Footer />
        <StickyCta />
      </div>
    </SoundBusProvider>
  );
}
