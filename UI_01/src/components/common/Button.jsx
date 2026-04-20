import { motion } from 'framer-motion' // Imports animation library for interactive UI effects

// ======================== Button ========================
// Button -> Reusable animated button component with variant-based styling and Framer Motion effects.
// ||
// ||
// ||
// Functions -> Button()-> Functional component entry:
// ||           |
// ||           |---> variants mapping-> Selects CSS class based on 'variant' prop
// ||           |
// ||           |---> UI Interactions -> Framer Motion lifecycle events:
// ||                 |
// ||                 |--- whileHover()-> Triggers 1.05 scale up on mouse enter
// ||                 |--- whileTap()-> Triggers 0.95 scale down on mouse down
// ||                 └── onClick()-> Executes parent callback function
// ||
// ===============================================================

// ---------------------------------------------------------------
// SECTION: CONSTANTS & STYLING
// ---------------------------------------------------------------
const variants = {
  primary:   'btn-primary',   // Theme -> Primary action styling
  secondary: 'btn-secondary', // Theme -> Secondary action styling
  ghost:     'btn-ghost',     // Theme -> Minimalist background-less styling
}

// ---------------------------------------------------------------
// SECTION: COMPONENT DEFINITION
// ---------------------------------------------------------------
const Button = ({ children, variant = 'primary', className = '', onClick, type = 'button', ...props }) => {

  // ---------------------------------------------------------------
  // SECTION: RENDER (JSX)
  // ---------------------------------------------------------------
  return (
    <motion.button
      type={type}
      className={`${variants[variant]} ${className}`} // UI Styling -> Dynamic class injection based on variant prop
      onClick={onClick}
      whileHover={{ scale: 1.05 }} // Animation -> whileHover()-> Provides visual feedback on mouse over
      whileTap={{ scale: 0.95 }}   // Animation -> whileTap()-> Provides tactile feedback on press
      {...props} // Data Passing -> Spreads additional attributes to the underlying motion element
    >
      {children} {/* UI Content -> Injects nested elements into the button body */}
    </motion.button>
  )
}

export default Button // Final Export: Optimized UI Action Component