import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getHomeRouteForUser } from '../utils/auth-roles';
import {
  Lock,
  Mail,
  User as UserIcon,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  ArrowLeft,
  Eye,
  EyeOff,
} from 'lucide-react';

export function SignupPage() {
  const { registerCitizen, isAuthenticated, user, isLoading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated and not loading, redirect to home route
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      navigate(getHomeRouteForUser(user), { replace: true });
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || isLoading) return;

    setFormError(null);
    clearError();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      setFormError('Full name must be at least 2 characters long.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setFormError('Please provide a valid email address (e.g. name@example.com).');
      return;
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match. Please re-enter.');
      return;
    }

    setSubmitting(true);
    try {
      const newUser = await registerCitizen(trimmedName, trimmedEmail, password);
      navigate(getHomeRouteForUser(newUser), { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = formError || authError;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200 flex flex-col justify-between selection:bg-cyan-500 selection:text-black">
      {/* Top Emergency Notice */}
      <aside aria-label="Emergency notice" className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2.5 text-center text-xs text-amber-300">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Immediate disaster emergency? You do not need to register to seek help.</span>
          <Link
            to="/report"
            className="font-bold underline text-amber-200 hover:text-white ml-1 transition"
          >
            Submit an Emergency Report Directly &rarr;
          </Link>
        </div>
      </aside>

      {/* Main Registration Container */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 my-8">
        <div className="w-full max-w-md bg-[#0d1522] border border-[#1f2e48] rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur">
          {/* Back to Platform Overview Link */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition mb-6 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition" />
            <span>Back to Platform Overview</span>
          </Link>

          {/* Logo & Platform Header */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-block group">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-950/50 mx-auto mb-4 group-hover:scale-105 transition">
                <ShieldCheck className="w-8 h-8 text-white" />
              </div>
            </Link>
            <h1 className="text-2xl font-black tracking-tight text-white">Citizen Registration</h1>
            <p className="text-xs text-cyan-300 font-medium mt-0.5">
              RELIEF-OS Community Access Portal
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Create an account to track emergency reports and receive shelter advisories.
            </p>
          </div>

          {/* Public Citizen Scope Notice */}
          <div className="mb-6 bg-cyan-950/40 border border-cyan-800/50 p-3.5 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <span className="font-bold text-white block">Citizen Portal Scope</span>
              This registration is for community members and affected residents. Official command center, admin, and department accounts are assigned by disaster administration.
            </div>
          </div>

          {/* Error Alert Box */}
          {displayError && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/50 border border-red-800/60 text-red-300 text-xs flex items-start gap-3 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Registration Failed</span>
                <span>{displayError}</span>
              </div>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="signup-name"
                className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider"
              >
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="signup-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. Rupjyoti Das"
                  autoComplete="name"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="signup-email"
                className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="your.email@example.com"
                  autoComplete="email"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="signup-password"
                className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider"
              >
                Password <span className="text-slate-500 font-normal">(Min 8 characters)</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  autoComplete="new-password"
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

            <div>
              <label
                htmlFor="signup-confirm-password"
                className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider"
              >
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="signup-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  autoComplete="new-password"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-200 transition focus:outline-none"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <span>Create Citizen Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Already have an account link */}
          <div className="mt-6 pt-5 border-t border-[#1f2e48] text-center space-y-1.5">
            <p className="text-xs text-slate-400">
              Already have an account?{' '}
              <Link to="/citizen/login" className="text-cyan-400 hover:text-cyan-300 font-semibold underline">
                Sign in to Citizen Portal
              </Link>
            </p>
            <p className="text-[11px] text-slate-500">
              Department or Admin user?{' '}
              <Link to="/login" className="text-slate-400 hover:text-slate-300 underline">
                Select another portal
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1f2e48] bg-[#0d1522] px-6 py-4 text-center text-xs text-slate-500">
        RELIEF-OS &copy; 2026 &bull; Secure Authentication &amp; Role-Guarded Access Engine.
      </footer>
    </div>
  );
}
