import { motion } from 'framer-motion'
import PricingCard from '../ui/PricingCard.jsx'

const plans = [
  {
    name: 'Starter', price: '₹4,116',
    description: 'Perfect for small teams getting started with AI voice.',
    features: ['1 AI Voice Agent', '500 minutes/month', 'Basic analytics dashboard', 'Email support', 'Standard voice models'],
    highlighted: false,
  },
  {
    name: 'Pro', price: '₹12,516',
    description: 'For growing businesses that need advanced capabilities.',
    features: ['5 AI Voice Agents', '5,000 minutes/month', 'Advanced analytics & sentiment', 'Priority support', 'Custom voice cloning', 'API access'],
    highlighted: true,
  },
  {
    name: 'Enterprise', price: 'Custom', period: '',
    description: 'For organizations with large-scale voice automation needs.',
    features: ['Unlimited AI Agents', 'Unlimited minutes', 'Dedicated account manager', '24/7 phone support', 'Custom integrations', 'SLA guarantee', 'On-premise deployment'],
    highlighted: false,
  },
]

const Pricing = () => {
  return (
    <section id="pricing" className="py-24 sm:py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="text-sm font-medium text-brand-accent tracking-wide uppercase">Pricing</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white">
            Simple, transparent{' '}
            <span className="text-gradient">pricing</span>
          </h2>
          <p className="mt-4 text-brand-muted leading-relaxed">
            Start free and scale as you grow. No hidden fees.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <PricingCard key={plan.name} {...plan} delay={i * 0.1} />
          ))}
        </div>
      </div>
    </section>
  )
}

export default Pricing