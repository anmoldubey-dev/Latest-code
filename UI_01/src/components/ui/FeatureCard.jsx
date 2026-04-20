import { motion } from 'framer-motion'

const FeatureCard = ({ icon: Icon, title, description, delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay }}
      className="glass-card-hover rounded-2xl p-6 flex flex-col gap-4 group cursor-default"
    >
      <div className="w-11 h-11 rounded-xl bg-brand-accent/10 flex items-center justify-center group-hover:bg-brand-accent/20 transition-colors duration-300">
        <Icon size={20} className="text-brand-accent" />
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="text-sm text-brand-muted leading-relaxed">{description}</p>
    </motion.div>
  )
}

export default FeatureCard