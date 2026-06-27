import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import TaglineStrip from "@/components/TaglineStrip";
import AiMlSection from "@/components/AiMlSection";
import LearnSection from "@/components/LearnSection";
import WhatsPossibleGallery from "@/components/WhatsPossibleGallery";
import CustomizeComponents from "@/components/CustomizeComponents";
import ClosingFlourish from "@/components/ClosingFlourish";
import Footer from "@/components/Footer";

function SectionDivider() {
  return <div className="mx-auto w-12 h-px bg-neutral-200 dark:bg-neutral-800" />;
}

export default function Page() {
  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 selection:bg-amber-200 transition-colors">
      <Navbar />
      <Hero />
      <SectionDivider />
      <TaglineStrip />
      <AiMlSection />
      <SectionDivider />
      <LearnSection />
      <SectionDivider />
      <WhatsPossibleGallery />
      <CustomizeComponents />
      <ClosingFlourish />
      <Footer />
    </main>
  );
}
