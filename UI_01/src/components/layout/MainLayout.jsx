import { Outlet } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'

const MainLayout = () => {
  return (
    <div className="min-h-screen bg-brand-bg bg-noise">
      <Navbar />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export default MainLayout