import { motion } from 'framer-motion'
import { UserPlus, PhoneCall, Rocket } from 'lucide-react'

// ======================== How It Works Orchestrator ========================
// HowItWorks -> A sequential roadmap module that visualizes the platform 
// onboarding journey through a multi-stage animated stepper interface.
// ||
// ||
// ||
// Functions -> HowItWorks()-> Main functional container for the process overview:
// ||           |
// ||           └── steps.map()-> [Logic Branch]: Iterates through the step 
// ||                registry to project sequential motion-delayed nodes.
// ||
// ===========================================================================

// ---------------------------------------------------------------
// SECTION: STATIC REGISTRY (WORKFLOW DATA)
// ---------------------------------------------------------------

const steps = [
  { icon: UserPlus, step: '01', title: 'Create Agent', description: "Design your AI agent's persona, script, and conversation flow using our intuitive builder." },
  { icon: PhoneCall, step: '02', title: 'Connect Number', description: 'Link your existing phone numbers or provision new ones from 60+ countries instantly.' },
  { icon: Rocket, step: '03', title: 'Launch', description: 'Go live and start handling calls. Monitor performance in real-time from your dashboard.' },
]

// ---------------------------------------------------------------
// SECTION: MAIN PRESENTATION COMPONENT
// ---------------------------------------------------------------

const HowItWorks = () => {
  // Initialization -> HowItWorks()-> Orchestrates the sequential workflow visualization

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <section className="py-24 sm:py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-accent/[0.02] to-transparent pointer-events-none" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="text-sm font-medium text-brand-accent tracking-wide uppercase">How It Works</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white">
            Three steps to{' '}
            <span className="text-gradient">transform</span> your calls
          </h2>
        </motion.div>

        <div className="flex flex-col md:flex-row gap-8 md:gap-6 relative">
          <div className="hidden md:block absolute top-16 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.15 }}
              className="flex-1 flex flex-col items-center text-center gap-5"
            >
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center">
                  <step.icon size={22} className="text-brand-accent" />
                </div>
              </div>
              <span className="text-xs font-bold text-brand-accent tracking-widest">{step.step}</span>
              <h3 className="text-lg font-semibold text-white">{step.title}</h3>
              <p className="text-sm text-brand-muted leading-relaxed max-w-xs">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default HowItWorks