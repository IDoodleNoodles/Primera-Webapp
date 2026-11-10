import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppShell } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LandingPage } from './pages/LandingPage'
import { AdminPage } from './pages/AdminPage'

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AppShell>
              <Routes>
                <Route index element={<AdminPage section="overview" />} />
                <Route path="accounts" element={<AdminPage section="accounts" />} />
                <Route path="audit" element={<AdminPage section="audit" />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={user ? '/admin' : '/'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
