import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getHomeRouteForUser } from '../utils/auth-roles';
import {
  ShieldAlert,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Info,
} from 'lucide-react';

export function LoginPage() {
  const { login, isAuthenticated, user, isLoading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated, redirect to designated workspace
  useEffect(() => {
    if (isAuthenticated && user) {
      const fromPath = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      const destination = fromPath && fromPath !== '/login' ? fromPath : getHomeRouteForUser(user);
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, user, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const loggedInUser = await login(trimmedEmail, password);
      const fromPath = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      const destination = fromPath && fromPath !== '/login' ? fromPath : getHomeRouteForUser(loggedInUser);
      navigate(destination, { replace: true });
    } catch {
      // Error is stored in auth context
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = formError || authError;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200 flex flex-col justify-between">
      {/* Top emergency announcement bar */}
      <div className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2.5 text-center text-xs text-amber-300">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Need immediate disaster assistance or rescue?</span>
          <Link
            to="/report"
            className="font-bold underline text-amber-200 hover:text-white ml-1"
          >
            Submit an Emergency Distress Report (No login required) &rarr;
          </Link>
        </div>
      </div>

      {/* Main Login Card Container */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 my-8">
        <div className="w-full max-w-md bg-[#0d1522] border border-[#1f2e48] rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur">
          {/* Logo & Platform Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-950/50 mx-auto mb-4">
              <ShieldAlert className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">RELIEF-OS</h1>
            <p className="text-xs text-slate-400 mt-1">
              AI-Powered Disaster Response &amp; Decision Intelligence Platform
            </p>
          </div>

          {/* Error Banner */}
          {displayError && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">{displayError}</div>
            </div>
          )}

          {/* Credentials Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="officer@relief-os.org or citizen@gmail.com"
                  autoComplete="email"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  autoComplete="current-password"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
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
                  <span>Sign In to Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Signup & Registration Links */}
          <div className="mt-6 pt-5 border-t border-[#1f2e48] text-center space-y-3">
            <p className="text-xs text-slate-400">
              Affected resident without an account?{' '}
              <Link to="/signup" className="text-cyan-400 hover:text-cyan-300 font-semibold underline">
                Create Citizen Account
              </Link>
            </p>

            {/* Official Authority Provisioning Note */}
            <div className="flex items-start gap-2 bg-[#131e31]/70 p-3 rounded-lg border border-[#1f2e48] text-left">
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <span className="font-semibold text-slate-300">Command Center &amp; Department Accounts:</span> Privileged operational roles are provisioned by disaster administration and cannot be created via public registration.
              </p>
            </div>
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
