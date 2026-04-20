// ======================== Home Page ========================
// Home -> Public landing page. Composes all marketing sections in order.
// ||
// ||
// ||
// Functions/Methods -> Home() -> Main component
// ||                 |
// ||                 |---> Logic Flow -> Component render:
// ||                                  |
// ||                                  |--- Render <Hero />
// ||                                  |--- Render <Features />
// ||                                  |--- Render <HowItWorks />
// ||                                  |--- Render <Pricing />
// ||
// ======================================================================

// ---------------------------------------------------------------
// SECTION: IMPORTS
// ---------------------------------------------------------------
import Hero       from '../components/sections/Hero.jsx'
import Features   from '../components/sections/Features.jsx'
import HowItWorks from '../components/sections/HowItWorks.jsx'
import Pricing    from '../components/sections/Pricing.jsx'

// ---------------------------------------------------------------
// SECTION: MAIN COMPONENT / EXPORT
// ---------------------------------------------------------------
const Home = () => {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
    </>
  )
}

export default Home