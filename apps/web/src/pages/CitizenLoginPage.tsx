import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSafeRedirectForUser } from '../utils/auth-roles';
import {
  Users,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';

export function CitizenLoginPage() {
  const { login, isAuthenticated, user, isLoading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated and not loading, redirect to citizen destination
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const fromPath = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      navigate(getSafeRedirectForUser(user, fromPath), { replace: true });
    }
  }, [isLoading, isAuthenticated, user, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || isLoading) return;

    setFormError(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError('Please enter your email address.');
      return;
    }
    if (!password) {
      setFormError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const loggedInUser = await login(trimmedEmail, password, 'citizen');
      const fromPath = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      navigate(getSafeRedirectForUser(loggedInUser, fromPath), { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please check your credentials.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = formError || authError;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200 flex flex-col justify-between selection:bg-cyan-500 selection:text-black">
      {/* Top emergency announcement bar */}
      <aside aria-label="Emergency notice" className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2.5 text-center text-xs text-amber-300">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Immediate disaster emergency? You do not need to sign in to request help.</span>
          <Link
            to="/report"
            className="font-bold underline text-amber-200 hover:text-white ml-1 transition"
          >
            Submit an Emergency Report (No login required) &rarr;
          </Link>
        </div>
      </aside>

      {/* Main Login Card Container */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 my-8">
        <div className="w-full max-w-md bg-[#0d1522] border border-[#1f2e48] rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur">
          {/* Back Navigation Links */}
          <div className="flex items-center justify-between mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition group"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition" />
              <span>Platform Overview</span>
            </Link>
            <Link
              to="/login"
              className="text-xs text-slate-400 hover:text-cyan-400 transition"
            >
              All Portals
            </Link>
          </div>

          {/* Logo & Platform Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-950/50 mx-auto mb-4">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Citizen Login</h1>
            <p className="text-xs text-cyan-300 font-medium mt-0.5">
              AAROH Community Access Portal
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Sign in to track emergency reports, find open shelters, and receive local disaster advisories.
            </p>
          </div>

          {/* Citizen Scope Notice */}
          <div className="mb-6 bg-cyan-950/40 border border-cyan-800/50 p-3.5 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <span className="font-bold text-white block">Citizen Access Only</span>
              This portal authenticates affected residents and community members. Department responders and administrators must use their designated portals.
            </div>
          </div>

          {/* Error Alert Box */}
          {displayError && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/50 border border-red-800/60 text-red-300 text-xs flex items-start gap-3 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Authentication Failed</span>
                <span>{displayError}</span>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="citizen-login-email"
                className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="citizen-login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. citizen@example.com"
                  autoComplete="email"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="citizen-login-password"
                className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="citizen-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  autoComplete="current-password"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-200 transition focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || isLoading}
              className="w-full mt-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl text-sm transition shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting || isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Citizen Account...</span>
                </>
              ) : (
                <>
                  <span>Sign In as Citizen</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Registration & Other Portals Links */}
          <div className="mt-6 pt-5 border-t border-[#1f2e48] text-center space-y-3">
            <p className="text-xs text-slate-400">
              New community member?{' '}
              <Link to="/citizen/signup" className="text-cyan-400 hover:text-cyan-300 font-semibold underline">
                Create Citizen Account
              </Link>
            </p>

            <div className="pt-2 flex items-center justify-center gap-4 text-xs text-slate-400">
              <span>Other portals:</span>
              <Link to="/department/login" className="text-indigo-400 hover:text-indigo-300 underline font-medium">
                Department Login
              </Link>
              <span className="text-slate-600">&bull;</span>
              <Link to="/admin/login" className="text-amber-400 hover:text-amber-300 underline font-medium">
                Admin Login
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1f2e48] bg-[#0d1522] px-6 py-4 text-center text-xs text-slate-500">
        AAROH &copy; 2026 &bull; Secure Authentication &amp; Role-Guarded Access Engine.
      </footer>
    </div>
  );
}
