import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './auth.jsx'
import { FeedbackProvider } from './components/feedback.jsx'
import './index.css'

// A data router, so editors can be warned before leaving a page with unsaved changes.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <AuthProvider>
        <FeedbackProvider>
          <App />
        </FeedbackProvider>
      </AuthProvider>
    ),
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
