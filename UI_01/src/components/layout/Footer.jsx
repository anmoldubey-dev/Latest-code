import { Twitter, Linkedin } from 'lucide-react'

const Footer = () => {
  return (
    <footer id="about" className="border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-1.5 text-sm text-brand-muted">
            <span>&copy; 2026 SR Comsoft Inc. All rights reserved.</span>
            <span className="hidden sm:inline text-white/20">|</span>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <span className="text-white/20">|</span>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
          <div className="flex items-center gap-2">
            <a href="#" className="p-2 rounded-lg text-brand-muted hover:text-white hover:bg-white/[0.05] transition-all duration-200" aria-label="Twitter">
              <Twitter size={16} />
            </a>
            <a href="#" className="p-2 rounded-lg text-brand-muted hover:text-white hover:bg-white/[0.05] transition-all duration-200" aria-label="LinkedIn">
              <Linkedin size={16} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer