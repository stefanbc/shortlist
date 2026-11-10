import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppProviders } from './providers'
import { routes } from './router'

const router = createBrowserRouter(routes)

function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}

export default App
