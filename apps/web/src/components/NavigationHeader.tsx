import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleBadgeLabel, getDepartmentLabel } from '../utils/auth-roles';
import { ShieldAlert, LogOut, User as UserIcon, AlertTriangle, LayoutDashboard } from 'lucide-react';

export function NavigationHeader() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="border-b border-[#1f2e48] bg-[#0d1522]/95 backdrop-blur sticky top-0 z-40 px-4 md:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Branding & Logo */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/20 group-hover:scale-105 transition-transform">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg tracking-wider text-white">AAROH</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                  SECURE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                AI-Powered Disaster Response &amp; Resource Intelligence
              </p>
            </div>
          </Link>
        </div>

        {/* Action Controls & User Info */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Always accessible Public Distress Report Button */}
          <Link
            to="/report"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Emergency Report</span>
          </Link>

          {/* Operational Demo Dashboard Link */}
          <Link
            to="/dashboard"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#131e31] hover:bg-[#1a2842] border border-[#1f2e48] text-slate-300 hover:text-white text-xs font-medium transition"
            title="Explore Interactive Command Map & Scenarios"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-cyan-400" />
            <span>Live Map / Demo</span>
          </Link>

          {/* Authenticated Portal Link */}
          {isAuthenticated && user && (
            <Link
              to={
                user.role === 'admin'
                  ? '/admin'
                  : user.role === 'citizen'
                  ? '/citizen'
                  : user.role === 'department' || user.role === 'coordinator' || user.role === 'team_lead'
                  ? '/department'
                  : '/command'
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-700/60 text-cyan-300 text-xs font-semibold transition"
            >
              <span>
                {user.role === 'admin'
                  ? 'Admin Portal'
                  : user.role === 'citizen'
                  ? 'Citizen Portal'
                  : user.role === 'department' || user.role === 'coordinator' || user.role === 'team_lead'
                  ? 'Department Portal'
                  : 'Command Center'}
              </span>
            </Link>
          )}

          {isAuthenticated && user ? (
            <div className="flex items-center gap-3 pl-2 sm:pl-3 border-l border-[#1f2e48]">
              {/* User details & badges */}
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-white flex items-center justify-end gap-1.5">
                  <UserIcon className="w-3 h-3 text-slate-400" />
                  <span>{user.name}</span>
                </div>
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-medium">
                    {getRoleBadgeLabel(user.role)}
                  </span>
                  {user.department && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      {getDepartmentLabel(user.department)}
                    </span>
                  )}
                </div>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-800/50 text-red-300 text-xs font-semibold transition"
                title="Sign out of AAROH session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2 border-l border-[#1f2e48]">
              <Link
                to="/login"
                className="px-3 py-1.5 rounded-lg bg-[#131e31] hover:bg-[#1f2e48] border border-[#1f2e48] text-slate-200 text-xs font-medium transition"
              >
                Sign In
              </Link>
              <Link
                to="/citizen/signup"
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
