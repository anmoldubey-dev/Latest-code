import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import Button from '../common/Button.jsx'

const PricingCard = ({ name, price, period = '/mo', description, features, highlighted = false, delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay }}
      className={`rounded-2xl p-8 flex flex-col gap-6 relative ${
        highlighted
          ? 'glass-card border-brand-accent/30 shadow-[0_0_40px_rgba(99,102,241,0.1)]'
          : 'glass-card'
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 rounded-full text-xs font-semibold bg-hero-gradient text-white">
            Most Popular
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-white">{name}</h3>
        <p className="text-sm text-brand-muted">{description}</p>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold text-white">{price}</span>
        {period && <span className="text-sm text-brand-muted">{period}</span>}
      </div>

      <ul className="flex flex-col gap-3 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-brand-muted">
            <Check size={16} className="text-brand-accent mt-0.5 shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button variant={highlighted ? 'primary' : 'secondary'} className="w-full justify-center">
        {highlighted ? 'Start Free Trial' : 'Get Started'}
      </Button>
    </motion.div>
  )
}

export default PricingCard