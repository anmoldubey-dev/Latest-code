// ======================== Input ========================
// Input -> A flexible, reusable form input component with dynamic label and error state handling.
// ||
// ||
// ||
// Functions -> Input()-> Functional component entry:
// ||           |
// ||           |---> onChange()-> Executes parent state update logic on value change
// ||           |
// ||           |---> UI Conditional Logic -> Dynamic element visibility:
// ||                 |
// ||                 |--- IF label prop exists
// ||                 |    └── Renders <label> linked via id for accessibility
// ||                 |--- IF error prop exists
// ||                      └── Renders <span> with validation feedback styling
// ||
// ===============================================================

// ---------------------------------------------------------------
// SECTION: COMPONENT DEFINITION
// ---------------------------------------------------------------
const Input = ({ label, type = 'text', placeholder, value, onChange, error, id, ...props }) => {

  // ---------------------------------------------------------------
  // SECTION: RENDER (JSX)
  // ---------------------------------------------------------------
  return (
    
    <div className="flex flex-col gap-1.5">
      
      {/* Module: Label -> Renders conditionally to provide field context */}
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-brand-muted">
          {label}
        </label>
      )}

      {/* Module: Input Field -> Standard HTML input with dynamic prop spreading */}
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange} // Interaction -> onChange()-> Dispatches input events to parent handler
        className="input-field"
        {...props} // Data Passing -> Spreads additional HTML attributes (required, disabled, etc.)
      />

      {/* Module: Error Feedback -> Renders conditionally to display validation failures */}
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}

    </div>
  )
}

export default Input // Final Export: Optimized Form Input Module