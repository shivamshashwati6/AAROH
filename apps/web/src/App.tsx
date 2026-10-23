import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { CitizenPortalPage } from './pages/CitizenPortalPage';
import { CommandCenterPage } from './pages/CommandCenterPage';
import { DepartmentPage } from './pages/DepartmentPage';
import { PublicReportPage } from './pages/PublicReportPage';
import { LegacyDashboardPage } from './pages/LegacyDashboardPage';
import { AdminPage } from './pages/AdminPage';
import { getHomeRouteForUser } from './utils/auth-roles';
import { Loader2 } from 'lucide-react';

/**
 * Root index dispatcher that routes authenticated users to their designated role portal,
 * and unauthenticated visitors to the public Landing Page.
 */
function RootDispatcher() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070b12] flex flex-col items-center justify-center p-6 text-slate-300">
        <div className="flex items-center gap-3 bg-[#0d1522] border border-[#1f2e48] px-6 py-4 rounded-xl shadow-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          <span className="text-sm font-medium tracking-wide">
            Initializing RELIEF-OS Session...
          </span>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <Navigate to={getHomeRouteForUser(user)} replace />;
  }

  return <LandingPage />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Access Routes */}
          <Route path="/" element={<RootDispatcher />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/report" element={<PublicReportPage />} />

          {/* Preserved Full Operational Map & AI Simulation Dashboard */}
          <Route path="/dashboard" element={<LegacyDashboardPage />} />
          <Route path="/overview" element={<Navigate to="/dashboard" replace />} />

          {/* Protected Route: Citizen Emergency Portal */}
          <Route
            path="/citizen"
            element={
              <ProtectedRoute allowedRoles={['citizen']}>
                <CitizenPortalPage />
              </ProtectedRoute>
            }
          />

          {/* Protected Route: Command Center & District Operations */}
          <Route
            path="/command"
            element={
              <ProtectedRoute allowedRoles={['command_center', 'admin', 'officer']}>
                <CommandCenterPage />
              </ProtectedRoute>
            }
          />

          {/* Protected Route: Department Operations & Logistics */}
          <Route
            path="/department"
            element={
              <ProtectedRoute allowedRoles={['department', 'coordinator', 'team_lead']}>
                <DepartmentPage />
              </ProtectedRoute>
            }
          />

          {/* Protected Route: System Administration & Governance */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
