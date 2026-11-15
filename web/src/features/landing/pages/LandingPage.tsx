import { Consultation } from "../components/Consultation";
import { Hero } from "../components/Hero";
import { LandingHeader } from "../components/LandingHeader";
import { Faq, FairTests, Rows, Steps } from "../components/Sections";
import { Dots } from "../components/Shape";

/**
 * LandingPage is the first page of the landing site: a block of the brand's
 * soft colour with the header, the headline, the join box and the photo; four
 * steps on a card over its lower edge; three rows about what the product has
 * today; how tests are kept fair; the consultation panel; and the questions.
 * It asks the API for nothing when it opens.
 */
export default function LandingPage() {
  return (
    <main id="top">
      <div className="bg-brand-soft relative overflow-hidden">
        <span
          aria-hidden="true"
          className="bg-brand absolute top-[-120px] left-[-90px] size-[220px] rounded-full opacity-[0.28] min-[720px]:size-[300px]"
        />
        <Dots className="bottom-[150px] left-7 hidden min-[960px]:block" />
        <LandingHeader onBand />
        <Hero />
      </div>
      <Steps />
      <Rows />
      <FairTests />
      <Consultation />
      <Faq />
    </main>
  );
}
