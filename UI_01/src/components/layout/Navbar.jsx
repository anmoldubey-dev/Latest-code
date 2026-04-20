import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import Logo   from '../common/Logo.jsx'
import Button from '../common/Button.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing',  href: '#pricing'  },
  { label: 'About',    href: '#about'    },
]

const Navbar = () => {
  const [scrolled,   setScrolled]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const { user, logout, isAdmin, isSuperuser } = useAuth()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNavClick = (href) => {
    setMobileOpen(false)
    if (href.startsWith('#')) {
      const el = document.querySelector(href)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleDashboard = () => {
    if (isAdmin)     return navigate('/admin')
    if (isSuperuser) return navigate('/superuser')
    navigate('/welcome')
  }

  const handleLogout = () => { logout(); navigate('/') }

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-brand-bg/80 backdrop-blur-xl border-b border-white/[0.06]' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-18">
          <Logo />

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a key={link.label} href={link.href}
                onClick={(e) => { e.preventDefault(); handleNavClick(link.href) }}
                className="text-sm font-medium text-brand-muted hover:text-white transition-colors duration-200">
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-brand-muted">Hi, {user.name?.split(' ')[0]}</span>
                <Button variant="ghost"     onClick={handleDashboard}>Dashboard</Button>
                <Button variant="secondary" onClick={handleLogout}>Logout</Button>
              </>
            ) : (
              <>
                <Button variant="ghost"   onClick={() => navigate('/login')}>Login</Button>
                <Button variant="primary" onClick={() => navigate('/register')}>Get Started</Button>
              </>
            )}
          </div>

          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-brand-muted hover:text-white transition-colors">
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }}
            className="md:hidden bg-brand-bg/95 backdrop-blur-xl border-t border-white/[0.06]"
          >
            <div className="px-4 py-6 flex flex-col gap-4">
              {navLinks.map((link) => (
                <a key={link.label} href={link.href}
                  onClick={(e) => { e.preventDefault(); handleNavClick(link.href) }}
                  className="text-sm font-medium text-brand-muted hover:text-white py-2 transition-colors">
                  {link.label}
                </a>
              ))}
              <div className="flex flex-col gap-3 pt-4 border-t border-white/[0.06]">
                {user ? (
                  <>
                    <Button variant="ghost"     onClick={() => { setMobileOpen(false); handleDashboard() }}>Dashboard</Button>
                    <Button variant="secondary" onClick={() => { setMobileOpen(false); handleLogout() }}>Logout</Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost"   onClick={() => { setMobileOpen(false); navigate('/login') }}>Login</Button>
                    <Button variant="primary" onClick={() => { setMobileOpen(false); navigate('/register') }}>Get Started</Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}

export default Navbar