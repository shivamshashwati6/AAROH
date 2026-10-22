import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../services/api';
import { NavigationHeader } from '../components/NavigationHeader';
import {
  AlertTriangle,
  MapPin,
  Phone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

export function PublicReportPage() {
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('Barpeta Town, Assam');
  const [lat, setLat] = useState<number>(26.3211);
  const [lng, setLng] = useState<number>(91.0045);
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [category, setCategory] = useState<string>('rescue');
  const [peopleAffected, setPeopleAffected] = useState<number>(10);
  const [medicalNeed, setMedicalNeed] = useState<boolean>(true);
  const [contactNumber, setContactNumber] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successReportId, setSuccessReportId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessReportId(null);

    if (!description.trim()) {
      setError('Please provide a brief description of the emergency situation.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.submitReport({
        description: description.trim(),
        location_name: locationName.trim(),
        lat: Number(lat),
        lng: Number(lng),
        severity,
        category,
        people_affected: peopleAffected > 0 ? peopleAffected : undefined,
        medical_need: medicalNeed,
        contact_number: contactNumber.trim() ? contactNumber.trim() : undefined,
        is_simulated: false,
      });

      setSuccessReportId(res.id);
      setDescription('');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to submit distress report. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200 flex flex-col justify-between">
      <NavigationHeader />

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 lg:p-8 my-4">
        <div className="mb-6">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-4 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Portal Access</span>
          </Link>

          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-800">
              PUBLIC EMERGENCY DISPATCH
            </span>
            <span className="text-xs text-slate-500">RELIEF-OS Fast Ingestion</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Emergency Distress Ingestion Form
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
            Citizens and first-responders can report real-time flood conditions, stranded groups, and medical emergencies. No login is required.
          </p>
        </div>

        {/* Success Confirmation Card */}
        {successReportId && (
          <div className="mb-6 p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 shadow-xl">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-white text-base">Distress Report Ingested Successfully</h3>
                <p className="text-xs text-emerald-300/90 mt-1">
                  Report ID: <span className="font-mono font-bold text-white bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">{successReportId}</span>
                </p>
                <p className="text-xs text-slate-300 mt-2">
                  Your situation has been registered in the PostGIS emergency database and queued for AI priority evaluation and District Command routing.
                </p>
                <button
                  type="button"
                  onClick={() => setSuccessReportId(null)}
                  className="mt-3 text-xs font-semibold text-emerald-400 hover:text-white underline cursor-pointer"
                >
                  Submit another distress report
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 sm:p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Emergency Situation Description <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe current conditions: water depth, stranded elderly or children, food/water shortage..."
                className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 rounded-xl p-3 text-sm text-white placeholder-slate-500 outline-none transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Location / Landmark Name
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Contact Phone (Optional)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Severity Tier
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as any)}
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 rounded-xl p-2 text-xs text-white outline-none"
                >
                  <option value="low">Low (Monitoring)</option>
                  <option value="medium">Medium (Advisory)</option>
                  <option value="high">High (Urgent)</option>
                  <option value="critical">Critical (Life Threat)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Primary Need
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 rounded-xl p-2 text-xs text-white outline-none"
                >
                  <option value="rescue">Rescue Boats</option>
                  <option value="medicine">Medical Care</option>
                  <option value="water">Clean Water</option>
                  <option value="food">Food Rations</option>
                  <option value="shelter">Emergency Shelter</option>
                  <option value="transportation">Road Evacuation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  People Affected
                </label>
                <input
                  type="number"
                  min={1}
                  value={peopleAffected}
                  onChange={(e) => setPeopleAffected(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 rounded-xl p-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Medical Risk
                </label>
                <label className="flex items-center gap-2 bg-[#131e31] border border-[#1f2e48] rounded-xl p-2 text-xs text-white cursor-pointer h-9">
                  <input
                    type="checkbox"
                    checked={medicalNeed}
                    onChange={(e) => setMedicalNeed(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
                  />
                  <span>Immediate Medical</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Latitude Coordinate
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Longitude Coordinate
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={lng}
                  onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2 text-xs text-white outline-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl text-sm transition shadow-lg shadow-orange-950/40 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Broadcasting to Emergency Database...</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>Dispatch Distress Report Now</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>

      <footer className="border-t border-[#1f2e48] bg-[#0d1522] px-6 py-4 text-center text-xs text-slate-500">
        RELIEF-OS &copy; 2026 &bull; Public Emergency Response Hotline.
      </footer>
    </div>
  );
}
