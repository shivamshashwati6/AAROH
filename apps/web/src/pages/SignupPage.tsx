import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getHomeRouteForUser } from '../utils/auth-roles';
import {
  ShieldAlert,
  Lock,
  Mail,
  User as UserIcon,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export function SignupPage() {
  const { registerCitizen, isAuthenticated, user, isLoading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated, redirect to home route
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getHomeRouteForUser(user), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      setFormError('Full name must be at least 2 characters long.');
      return;
    }

    if (!trimmedEmail) {
      setFormError('Please provide a valid email address.');
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
    } catch {
      // Handled in auth context
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = formError || authError;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200 flex flex-col justify-between">
      {/* Top Emergency Notice */}
      <div className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2.5 text-center text-xs text-amber-300">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Immediate disaster emergency? You do not need to register to seek help.</span>
          <Link
            to="/report"
            className="font-bold underline text-amber-200 hover:text-white ml-1"
          >
            Submit an Emergency Report Directly &rarr;
          </Link>
        </div>
      </div>

      {/* Main Registration Card */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 my-8">
        <div className="w-full max-w-md bg-[#0d1522] border border-[#1f2e48] rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur">
          {/* Logo & Platform Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-950/50 mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Citizen Registration</h1>
            <p className="text-xs text-slate-400 mt-1">
              Create a verified account to submit distress reports, track relief updates, and access shelters
            </p>
          </div>

          {/* Role Policy Notice */}
          <div className="mb-6 p-3 rounded-xl bg-blue-950/30 border border-blue-800/40 text-[11px] text-blue-200 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Public Account Policy:</span> Public self-registration is strictly restricted to <span className="text-cyan-300 font-bold">Citizen</span> accounts. Command Center and Department credentials require official administrative authorization.
            </div>
          </div>

          {/* Error Banner */}
          {displayError && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">{displayError}</div>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="Aarav Sharma"
                  autoComplete="name"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

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
                  placeholder="citizen@example.com"
                  autoComplete="email"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Password <span className="text-slate-500 font-normal lowercase">(minimum 8 characters)</span>
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
                  autoComplete="new-password"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Confirm Password
              </label>
              <div className="relative">
                <CheckCircle2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  autoComplete="new-password"
                  required
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || isLoading}
              className="w-full mt-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl text-sm transition shadow-lg shadow-teal-900/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting || isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Citizen Account...</span>
                </>
              ) : (
                <>
                  <span>Complete Citizen Registration</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 pt-5 border-t border-[#1f2e48] text-center">
            <p className="text-xs text-slate-400">
              Already have an account?{' '}
              <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-semibold underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1f2e48] bg-[#0d1522] px-6 py-4 text-center text-xs text-slate-500">
        RELIEF-OS &copy; 2026 &bull; Secure Authentication &amp; Public Citizen Portal.
      </footer>
    </div>
  );
}
