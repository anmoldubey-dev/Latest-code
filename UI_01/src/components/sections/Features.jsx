import { motion } from 'framer-motion'
import { Bot, MessageSquare, Phone, BarChart3, Zap, Shield } from 'lucide-react'
import FeatureCard from '../ui/FeatureCard.jsx'

// ======================== Features Section Orchestrator ========================
// Features -> A high-level presentational component that enumerates platform 
// capabilities through a responsive grid of animated feature nodes, utilizing 
// motion-interpolated entry headers.
// ||
// ||
// ||
// Functions -> Features()-> Main functional entry point for the features segment:
// ||           |
// ||           └── feature.map()-> [Logic Branch]: Dynamically projects the 
// ||                feature configuration registry into individual FeatureCard()-> nodes.
// ||
// ===============================================================================

// ---------------------------------------------------------------
// SECTION: STATIC REGISTRY (FEATURE DATA)
// ---------------------------------------------------------------

const features = [
  { icon: Bot, title: 'AI Voice Agents', description: 'Deploy intelligent voice agents that understand context, handle objections, and close conversations naturally.' },
  { icon: MessageSquare, title: 'Real-Time Conversations', description: 'Ultra-low latency responses that make AI conversations feel indistinguishable from human interactions.' },
  { icon: Phone, title: 'Seamless Call Routing', description: 'Smart call routing with automatic escalation to human agents when complex situations arise.' },
  { icon: BarChart3, title: 'Live Analytics', description: 'Monitor call performance, sentiment analysis, and agent effectiveness in real-time dashboards.' },
  { icon: Zap, title: 'Instant Deployment', description: 'Go live in minutes with pre-built templates. Connect your phone numbers and start automating immediately.' },
  { icon: Shield, title: 'Enterprise Security', description: 'SOC 2 compliant infrastructure with end-to-end encryption and full audit trails for every interaction.' },
]

// ---------------------------------------------------------------
// SECTION: MAIN PRESENTATION COMPONENT
// ---------------------------------------------------------------

const Features = () => {
  // Initialization -> Features()-> Orchestrates the layout of the feature overview section
  return (
    <section id="features" className="py-24 sm:py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="text-sm font-medium text-brand-accent tracking-wide uppercase">Features</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white">
            Everything you need to build{' '}
            <span className="text-gradient">voice AI</span>
          </h2>
          <p className="mt-4 text-brand-muted leading-relaxed">
            A complete platform for creating, deploying, and managing AI-powered voice agents at scale.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <FeatureCard key={feature.title} {...feature} delay={i * 0.1} />
          ))}
        </div>
      </div>
    </section>
  )
}

export default Features