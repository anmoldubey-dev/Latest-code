import { motion } from 'framer-motion'
import { ArrowRight, Play } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../common/Button.jsx'

// ======================== Hero Section Orchestrator ========================
// Hero -> Primary landing module designed to anchor user engagement via 
// high-impact typography, animated value-propositions, and a complex 
// SVG-based visual engine representing real-time AI audio processing.
// ||
// ||
// ||
// Functions -> Hero()-> Main functional container for the landing experience:
// ||           |
// ||           |--- useNavigate()-> Initialization: Hooks into the router 
// ||           |    system for registration-path dispatching.
// ||           |
// ||           └── (Visual Branch):
// ||                ├── fadeInUp -> Design Token: Orchestrates alpha/temporal transitions.
// ||                └── animated SVG logic -> Internal rendering of audio telemetry.
// ||
// ===========================================================================

// ---------------------------------------------------------------
// SECTION: ANIMATION CONFIGURATION (DESIGN TOKENS)
// ---------------------------------------------------------------

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
}

// ---------------------------------------------------------------
// SECTION: MAIN HERO COMPONENT
// ---------------------------------------------------------------

const Hero = () => {
  // Initialization -> useNavigate()-> Sets up the routing bridge for CTA interactions
  const navigate = useNavigate()

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-accent/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-brand-violet/15 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[150px]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="flex flex-col gap-8 z-10">
            <motion.div {...fadeInUp} transition={{ duration: 0.6, delay: 0.1 }}>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-brand-accent/10 text-brand-accent border border-brand-accent/20">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
                Now in Public Beta
              </span>
            </motion.div>

            <motion.h1 {...fadeInUp} transition={{ duration: 0.6, delay: 0.2 }}
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight">
              <span className="text-gradient">Call Center</span>
              <br />
              <span className="text-white">AI</span>
            </motion.h1>

            <motion.p {...fadeInUp} transition={{ duration: 0.6, delay: 0.3 }}
              className="text-lg text-brand-muted leading-relaxed max-w-lg">
              Build Human-Like AI Voice Agents in Minutes. Automate calls,
              reduce costs, and deliver exceptional customer experiences 24/7.
            </motion.p>

            <motion.div {...fadeInUp} transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-wrap gap-4">
              <Button variant="primary" onClick={() => navigate('/register')}>
                Start Free Trial <ArrowRight size={16} className="ml-2" />
              </Button>
              <Button variant="secondary">
                <Play size={14} className="mr-2" /> Book Demo
              </Button>
            </motion.div>

            <motion.div {...fadeInUp} transition={{ duration: 0.6, delay: 0.5 }}
              className="flex items-center gap-6 pt-4">
              {[
                { value: '10M+', label: 'Calls Handled' },
                { value: '99.9%', label: 'Uptime' },
                { value: '< 300ms', label: 'Latency' },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col">
                  <span className="text-xl font-bold text-white">{stat.value}</span>
                  <span className="text-xs text-brand-muted">{stat.label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative hidden lg:flex items-center justify-center"
          >
            <div className="relative w-full max-w-md aspect-square">
              <div className="absolute inset-0 rounded-full border border-white/[0.06] animate-pulse-slow" />
              <div className="absolute inset-4 rounded-full border border-white/[0.04]" />
              <div className="absolute inset-8 rounded-full border border-indigo-500/10" />
              <div className="absolute inset-16 rounded-full bg-gradient-to-br from-brand-accent/20 to-brand-violet/20 blur-2xl animate-pulse-slow" />
              <div className="absolute inset-20 rounded-full bg-gradient-to-br from-brand-accent/30 to-brand-violet/30 blur-xl" />

              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-brand-accent to-brand-violet flex items-center justify-center shadow-[0_0_60px_rgba(99,102,241,0.3)]">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                      <rect x="4" y="16" width="3" height="8" rx="1.5" fill="white" opacity="0.6"><animate attributeName="height" values="8;16;8" dur="1s" repeatCount="indefinite" /><animate attributeName="y" values="16;12;16" dur="1s" repeatCount="indefinite" /></rect>
                      <rect x="10" y="12" width="3" height="16" rx="1.5" fill="white" opacity="0.8"><animate attributeName="height" values="16;8;16" dur="0.8s" repeatCount="indefinite" /><animate attributeName="y" values="12;16;12" dur="0.8s" repeatCount="indefinite" /></rect>
                      <rect x="16" y="8" width="3" height="24" rx="1.5" fill="white">              <animate attributeName="height" values="24;12;24" dur="1.2s" repeatCount="indefinite" /><animate attributeName="y" values="8;14;8" dur="1.2s" repeatCount="indefinite" /></rect>
                      <rect x="22" y="10" width="3" height="20" rx="1.5" fill="white" opacity="0.8"><animate attributeName="height" values="20;8;20" dur="0.9s" repeatCount="indefinite" /><animate attributeName="y" values="10;16;10" dur="0.9s" repeatCount="indefinite" /></rect>
                      <rect x="28" y="14" width="3" height="12" rx="1.5" fill="white" opacity="0.6"><animate attributeName="height" values="12;20;12" dur="1.1s" repeatCount="indefinite" /><animate attributeName="y" values="14;10;14" dur="1.1s" repeatCount="indefinite" /></rect>
                      <rect x="34" y="16" width="3" height="8" rx="1.5" fill="white" opacity="0.4"><animate attributeName="height" values="8;14;8" dur="0.7s" repeatCount="indefinite" /><animate attributeName="y" values="16;13;16" dur="0.7s" repeatCount="indefinite" /></rect>
                    </svg>
                  </div>
                </div>
              </div>

              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute top-12 -right-4 glass-card rounded-xl px-4 py-2.5 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-xs font-medium text-white">Agent Live</span>
              </motion.div>

              <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                className="absolute bottom-16 -left-8 glass-card rounded-xl px-4 py-2.5">
                <span className="text-xs text-brand-muted">Latency</span>
                <span className="text-sm font-semibold text-white ml-2">128ms</span>
              </motion.div>

              <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                className="absolute bottom-4 right-0 glass-card rounded-xl px-4 py-2.5">
                <span className="text-xs text-brand-muted">Sentiment</span>
                <span className="text-sm font-semibold text-green-400 ml-2">Positive</span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default Hero