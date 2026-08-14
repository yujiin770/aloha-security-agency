import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

// Self-hosted so no font CDN is needed — the CSP in index.html blocks external
// hosts, and a missing brand font on a government-facing site looks broken.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
// 800 is used only by the marketing hero display type.
import '@fontsource/inter/800.css'

import './styles/index.css'
import { AppProviders } from './app/providers'
import { router } from './app/router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
