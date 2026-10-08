import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppShell, DoctorShell } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LandingPage } from './pages/LandingPage'
import { AdminPage } from './pages/AdminPage'
import { DoctorPage } from './pages/DoctorPage'
import { PatientDetailPage } from './pages/PatientDetailPage'
import { DoctorProfilePage } from './pages/DoctorProfilePage'

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
                <Route index element={<AdminPage />} />
                <Route path="patients" element={<AdminPage />} />
                <Route path="doctors" element={<AdminPage />} />
                <Route path="assignments" element={<AdminPage />} />
                <Route path="logs" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/doctor/*"
        element={
          <ProtectedRoute allowedRoles={['doctor']}>
            <DoctorShell>
              <Routes>
                <Route index element={<DoctorPage />} />
                <Route path="patients" element={<DoctorPage />} />
                <Route path="patients/:patientId" element={<PatientDetailPage />} />
                <Route path="alerts" element={<DoctorPage />} />
                <Route path="profile" element={<DoctorProfilePage />} />
                <Route path="*" element={<Navigate to="/doctor" replace />} />
              </Routes>
            </DoctorShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={<Navigate to={user?.role === 'admin' ? '/admin' : user?.role === 'doctor' ? '/doctor' : '/'} replace />}
      />
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
