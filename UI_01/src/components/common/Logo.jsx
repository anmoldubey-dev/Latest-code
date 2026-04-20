import { Link } from 'react-router-dom'

const Logo = () => {
  return (
    <Link to="/" className="flex flex-col gap-0.5">
      <span className="text-xl font-bold tracking-tight text-white">
        SR <span className="text-gradient">Comsoft</span>
      </span>
      <span className="text-[10px] font-medium tracking-widest uppercase text-brand-muted">
        AI Powered Voice Infrastructure
      </span>
    </Link>
  )
}

export default Logo