// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | createRoot()              |
// | * bootstrap React app     |
// +---------------------------+
//     |
//     |----> render()
//     |        * mount vDOM to DOM
//     |
//     |----> App()
//     |        * start main router
//     |
//     v
// [ END ]
// ================================================================

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
