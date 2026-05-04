import Navbar from "@/components/Navbar";
import PartnershipBanner from "@/components/PartnershipBanner";
import Hero from "@/components/Hero";
import TaglineStrip from "@/components/TaglineStrip";
import WhatsPossibleGallery from "@/components/WhatsPossibleGallery";
import LearnSection from "@/components/LearnSection";
import PromptToViz from "@/components/PromptToViz";
import CustomizeComponents from "@/components/CustomizeComponents";
import ClosingFlourish from "@/components/ClosingFlourish";
import Footer from "@/components/Footer";

export default function Page() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <Navbar />
      <PartnershipBanner />
      <Hero />
      <TaglineStrip />
      <WhatsPossibleGallery />
      <LearnSection />
      <PromptToViz />
      <CustomizeComponents />
      <ClosingFlourish />
      <Footer />
    </main>
  );
}
