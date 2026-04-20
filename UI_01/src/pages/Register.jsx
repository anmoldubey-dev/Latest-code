// ======================== Register Page ========================
// Register -> New user registration page. Validates form, POSTs to /api/register,
//             stores token via AuthContext, and redirects to /welcome.
// ||
// ||
// ||
// Functions/Methods -> Register() -> Main component
// ||                 |
// ||                 |---> validate()      -> Client-side validation for all 5 fields
// ||                 |---> handleSubmit()  -> Validate -> POST /api/register -> login() -> /welcome
// ||                 |---> handleChange()  -> Update form field -> Clear field error on change
// ||                 |
// ||                 |---> Logic Flow -> Component render:
// ||                                  |
// ||                                  |--- validate()
// ||                                  |    ├── name empty          -> Error
// ||                                  |    ├── email empty/invalid -> Error
// ||                                  |    ├── phone non-10 digits -> Error (optional field)
// ||                                  |    ├── password empty/< 8  -> Error
// ||                                  |    └── confirmPassword mismatch -> Error
// ||                                  |
// ||                                  |--- handleSubmit()
// ||                                  |    ├── validate() -> IF errors -> setErrors + return
// ||                                  |    ├── POST /api/register with name, email, phone, password
// ||                                  |    ├── IF res.ok -> login(token, user) -> navigate /welcome
// ||                                  |    ├── IF res not ok -> Set email error from data.error
// ||                                  |    └── IF network error -> Set server error message
// ||                                  |
// ||                                  |--- Render -> Background glows + back button + glass card
// ||                                  |    ├── Logo + heading
// ||                                  |    ├── Name, Email, Phone, Password, ConfirmPassword inputs
// ||                                  |    ├── Submit button
// ||                                  |    └── Sign in link
// ||
// ======================================================================

// ---------------------------------------------------------------
// SECTION: IMPORTS
// ---------------------------------------------------------------
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import Logo   from '../components/common/Logo.jsx'
import Input  from '../components/common/Input.jsx'
import Button from '../components/common/Button.jsx'
import { useAuth } from '../context/AuthContext.jsx'

// ---------------------------------------------------------------
// SECTION: MAIN COMPONENT / EXPORT
// ---------------------------------------------------------------
const Register = () => {

  // ---------------------------------------------------------------
  // SECTION: STATE & HOOKS
  // ---------------------------------------------------------------
  const navigate  = useNavigate()
  const { login } = useAuth()

  const [form,    setForm]    = useState({ name: '', email: '', phone_number: '', password: '', confirmPassword: '' })
  const [errors,  setErrors]  = useState({})
  const [loading, setLoading] = useState(false)

  // ---------------------------------------------------------------
  // SECTION: HELPERS
  // ---------------------------------------------------------------

  // validate -> Returns error map for all registration fields
  const validate = () => {
    const errs = {}
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const phoneRegex = /^[0-9]{10}$/

    if (!form.name.trim())  errs.name  = 'Name is required'
    if (!form.email)        errs.email = 'Email is required'
    else if (!emailRegex.test(form.email)) errs.email = 'Enter a valid email'

    // phone_number -> Optional field, only validate if provided
    if (form.phone_number && !phoneRegex.test(form.phone_number)) errs.phone_number = 'Enter a valid 10-digit number'

    if (!form.password)                errs.password = 'Password is required'
    else if (form.password.length < 8) errs.password = 'Minimum 8 characters'

    if (!form.confirmPassword)         errs.confirmPassword = 'Please confirm your password'
    else if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'

    return errs
  }

  // ---------------------------------------------------------------
  // SECTION: EVENT HANDLERS
  // ---------------------------------------------------------------

  // handleSubmit -> Validate -> POST /api/register -> login() -> navigate /welcome
  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return  // Guard -> Abort if validation fails

    setLoading(true)
    try {
      const res  = await fetch('/api/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: form.name, email: form.email, phone_number: form.phone_number, password: form.password }),
      })
      const data = await res.json()

      if (res.ok) {
        const userData = data.user || { name: form.name, email: form.email }  // Fallback if user not returned
        login(data.token, userData)
        navigate('/welcome', { replace: true })
      } else {
        setErrors({ email: data.error || 'Registration failed' })  // API error message
      }
    } catch {
      setErrors({ email: 'Server error. Try again later.' })  // Network failure
    } finally {
      setLoading(false)
    }
  }

  // handleChange -> Update form field + clear its error on keystroke
  const handleChange = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    if (errors[field]) setErrors({ ...errors, [field]: '' })
  }

  // ---------------------------------------------------------------
  // SECTION: RENDER
  // ---------------------------------------------------------------
  return (
    <div className="min-h-screen bg-brand-bg bg-noise flex items-center justify-center px-4 py-12 relative overflow-hidden">

      {/* Background glows -> Decorative blur orbs */}
      <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-brand-violet/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/3 w-72 h-72 bg-brand-accent/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Back button -> Animated slide-in from left */}
      <motion.button
        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate('/')} whileHover={{ x: -3 }}
        className="absolute top-6 left-6 sm:top-8 sm:left-8 z-20 inline-flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-medium text-brand-muted hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200"
      >
        <ArrowLeft size={15} /> Back to home
      </motion.button>

      {/* Card -> Fade + slide up on mount */}
      <motion.div
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }} className="w-full max-w-md z-10"
      >
        <div className="glass-card rounded-2xl p-8 sm:p-10">
          <div className="flex flex-col gap-6">

            {/* Header -> Logo + title */}
            <div className="flex flex-col items-center gap-3">
              <Logo />
              <h1 className="text-2xl font-bold text-white mt-4">Create your account</h1>
              <p className="text-sm text-brand-muted">Start building voice AI in minutes</p>
            </div>

            {/* Form -> All registration fields + submit */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <Input id="name"            label="Full Name"               type="text"     placeholder="John Doe"        value={form.name}            onChange={handleChange('name')}            error={errors.name}            />
              <Input id="email"           label="Email"                   type="email"    placeholder="you@company.com" value={form.email}           onChange={handleChange('email')}           error={errors.email}           />
              <Input id="phone_number"    label="Phone Number (optional)" type="tel"      placeholder="9876543210"      value={form.phone_number}    onChange={handleChange('phone_number')}    error={errors.phone_number}    />
              <Input id="password"        label="Password"                type="password" placeholder="••••••••"        value={form.password}        onChange={handleChange('password')}        error={errors.password}        />
              <Input id="confirmPassword" label="Confirm Password"        type="password" placeholder="••••••••"        value={form.confirmPassword} onChange={handleChange('confirmPassword')} error={errors.confirmPassword} />

              {/* Submit -> Shows spinner label while loading */}
              <Button type="submit" variant="primary" className="w-full justify-center mt-2" disabled={loading}>
                {loading ? 'Creating account…' : 'Create Account'}
              </Button>
            </form>

            {/* Footer -> Link to login */}
            <p className="text-center text-sm text-brand-muted">
              Already have an account?{' '}
              <Link to="/login" className="text-brand-accent hover:text-brand-accent-hover font-medium transition-colors">Sign in</Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Register