import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { TranslationProvider } from './contexts/TranslationContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppShell from './components/layout/AppShell';
import Spinner from './components/ui/Spinner';
import api from './lib/api';

import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import BookingsPage from './pages/BookingsPage';
import BookingFormPage from './pages/BookingFormPage';
import BookingDetailPage from './pages/BookingDetailPage';
import AnimalsPage from './pages/AnimalsPage';
import AnimalDetailPage from './pages/AnimalDetailPage';
import TutorsPage from './pages/TutorsPage';
import TutorDetailPage from './pages/TutorDetailPage';
import ServicesPage from './pages/ServicesPage';
import CalendarPage from './pages/CalendarPage';
import SettingsPage from './pages/SettingsPage';
import SigningPage from './pages/SigningPage';
import VerifyPage from './pages/VerifyPage';
import GaleriaPage from './pages/GaleriaPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState<'loading' | 'ok' | 'setup'>('loading');

  useEffect(() => {
    if (!isAuthenticated) { setStatus('ok'); return; }
    api.get('/settings').then((res: any) => {
      setStatus(res.data.onboarding_completo ? 'ok' : 'setup');
    }).catch(() => setStatus('ok'));
  }, [isAuthenticated]);

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <Spinner size="lg" />
      </div>
    );
  }
  if (status === 'setup') return <Navigate to="/setup" state={{ from: location }} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <TranslationProvider>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/setup" element={<OnboardingPage />} />
                <Route path="/assinar" element={<SigningPage />} />
                <Route path="/verificar" element={<VerifyPage />} />
                <Route path="/galeria" element={<GaleriaPage />} />

                {/* Admin routes */}
                <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/bookings" element={<BookingsPage />} />
                  <Route path="/bookings/new" element={<BookingFormPage />} />
                  <Route path="/bookings/:id" element={<BookingDetailPage />} />
                  <Route path="/animals" element={<AnimalsPage />} />
                  <Route path="/animals/:id" element={<AnimalDetailPage />} />
                  <Route path="/tutors" element={<TutorsPage />} />
                  <Route path="/tutors/:id" element={<TutorDetailPage />} />
                  <Route path="/services" element={<ServicesPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </TranslationProvider>
    </ThemeProvider>
  );
}
