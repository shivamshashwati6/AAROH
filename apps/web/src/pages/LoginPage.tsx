import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSafeRedirectForUser } from '../utils/auth-roles';
import {
  ShieldAlert,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
  Users,
  Warehouse,
  KeyRound,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export function LoginPage() {
  const { login, isAuthenticated, user, isLoading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDirectLogin, setShowDirectLogin] = useState(true);
  const [selectedPortal, setSelectedPortal] = useState<'citizen' | 'department' | 'admin' | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated and done loading, redirect to role-authorized destination
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
      const loggedInUser = await login(trimmedEmail, password, selectedPortal);
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
          <span>Need immediate disaster assistance or rescue?</span>
          <Link
            to="/report"
            className="font-bold underline text-amber-200 hover:text-white ml-1 transition"
          >
            Submit an Emergency Distress Report (No login required) &rarr;
          </Link>
        </div>
      </aside>

      {/* Main Content Container */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 my-8 max-w-4xl mx-auto w-full">
        {/* Back to Platform Overview Link */}
        <div className="w-full flex items-center justify-between mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition" />
            <span>Back to Platform Overview</span>
          </Link>
          <span className="text-xs text-slate-500">
            AAROH &bull; Multi-Role Portal Dispatcher
          </span>
        </div>

        {/* Header */}
        <div className="text-center mb-10">
          <Link to="/" className="inline-block group">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-950/50 mx-auto mb-4 group-hover:scale-105 transition">
              <ShieldAlert className="w-8 h-8 text-white" />
            </div>
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-white">Select Your Access Portal</h1>
          <p className="text-xs text-cyan-300 font-medium mt-1">
            Choose your designated operational portal or citizen workspace to continue
          </p>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* Portal Selection Cards (Citizen, Department, Admin)                */}
        {/* ------------------------------------------------------------------- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full mb-8">
          {/* Card 1: Citizen Login */}
          <div className="bg-[#0d1522] border border-[#1f2e48] hover:border-cyan-500/60 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-cyan-950/20 group">
            <div>
              <div className="w-11 h-11 rounded-xl bg-cyan-950/70 border border-cyan-800/60 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-105 transition">
                <Users className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-white mb-1">Citizen Portal</h2>
              <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider block mb-2">
                Public Resident Access
              </span>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                View open shelters, track distress reports, and receive emergency advisories.
              </p>
            </div>
            <div className="space-y-2 pt-2 border-t border-[#1f2e48]">
              <Link
                to="/citizen/login"
                className="w-full py-2.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-950 transition"
              >
                <span>Citizen Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                to="/citizen/signup"
                className="w-full py-2 px-3 rounded-xl border border-[#1f2e48] hover:border-cyan-500/50 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center justify-center transition"
              >
                <span>Create Citizen Account</span>
              </Link>
            </div>
          </div>

          {/* Card 2: Department Login */}
          <div className="bg-[#0d1522] border border-[#1f2e48] hover:border-indigo-500/60 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-indigo-950/20 group">
            <div>
              <div className="w-11 h-11 rounded-xl bg-indigo-950/70 border border-indigo-800/60 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-105 transition">
                <Warehouse className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-white mb-1">Department Operations</h2>
              <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider block mb-2">
                Health &bull; Supply &bull; Rescue
              </span>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Field team operations, medical unit deployment, supply warehouse stock, and road clearance logs.
              </p>
            </div>
            <div className="space-y-2 pt-2 border-t border-[#1f2e48]">
              <Link
                to="/department/login"
                className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-950 transition"
              >
                <span>Department Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <span className="text-[10px] text-slate-500 block text-center py-1">
                Accounts provisioned by administration
              </span>
            </div>
          </div>

          {/* Card 3: Admin Login */}
          <div className="bg-[#0d1522] border border-[#1f2e48] hover:border-amber-500/60 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-amber-950/20 group">
            <div>
              <div className="w-11 h-11 rounded-xl bg-amber-950/70 border border-amber-800/60 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-105 transition">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-white mb-1">Administration</h2>
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block mb-2">
                Governance &amp; Command
              </span>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Root system administration, user management, audit trails, and crisis decision engine governance.
              </p>
            </div>
            <div className="space-y-2 pt-2 border-t border-[#1f2e48]">
              <Link
                to="/admin/login"
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-950 transition"
              >
                <span>Admin Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <span className="text-[10px] text-slate-500 block text-center py-1">
                Restricted to authorized administrators
              </span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* Direct Authentication Form (Backward-Compatible Access)             */}
        {/* ------------------------------------------------------------------- */}
        <div className="w-full max-w-md bg-[#0d1522] border border-[#1f2e48] rounded-2xl shadow-2xl p-6 sm:p-7 backdrop-blur">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1f2e48]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Direct Sign In
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDirectLogin(!showDirectLogin)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
            >
              <span>{showDirectLogin ? 'Hide Form' : 'Show Form'}</span>
              {showDirectLogin ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showDirectLogin && (
            <>
              {/* Optional Portal Filter Toggle */}
              <div className="mb-4">
                <span className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Select Expected Role (Optional)
                </span>
                <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedPortal(undefined)}
                    className={`py-1.5 px-2 rounded-lg font-medium transition ${
                      selectedPortal === undefined
                        ? 'bg-cyan-600 text-white font-bold'
                        : 'bg-[#131e31] text-slate-400 hover:text-white'
                    }`}
                  >
                    Any
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPortal('citizen')}
                    className={`py-1.5 px-2 rounded-lg font-medium transition ${
                      selectedPortal === 'citizen'
                        ? 'bg-cyan-600 text-white font-bold'
                        : 'bg-[#131e31] text-slate-400 hover:text-white'
                    }`}
                  >
                    Citizen
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPortal('department')}
                    className={`py-1.5 px-2 rounded-lg font-medium transition ${
                      selectedPortal === 'department'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-[#131e31] text-slate-400 hover:text-white'
                    }`}
                  >
                    Dept
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPortal('admin')}
                    className={`py-1.5 px-2 rounded-lg font-medium transition ${
                      selectedPortal === 'admin'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'bg-[#131e31] text-slate-400 hover:text-white'
                    }`}
                  >
                    Admin
                  </button>
                </div>
              </div>

              {/* Error Alert Box */}
              {displayError && (
                <div className="mb-4 p-3.5 rounded-xl bg-red-950/50 border border-red-800/60 text-red-300 text-xs flex items-start gap-2.5 animate-fadeIn">
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
                    htmlFor="login-email"
                    className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      placeholder="e.g. citizen@relief.internal or admin@relief.internal"
                      autoComplete="email"
                      required
                      className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      id="login-password"
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
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Signup Link */}
              <div className="mt-5 pt-4 border-t border-[#1f2e48] text-center">
                <p className="text-xs text-slate-400">
                  Affected resident without an account?{' '}
                  <Link to="/citizen/signup" className="text-cyan-400 hover:text-cyan-300 font-semibold underline">
                    Create Citizen Account
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1f2e48] bg-[#0d1522] px-6 py-4 text-center text-xs text-slate-500">
        AAROH &copy; 2026 &bull; Secure Authentication &amp; Role-Guarded Access Engine.
      </footer>
    </div>
  );
}
