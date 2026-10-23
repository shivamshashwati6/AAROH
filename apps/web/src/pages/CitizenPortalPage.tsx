import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavigationHeader } from '../components/NavigationHeader';
import { api, ApiError, ShelterSuggestionItem, CreateReportPayload } from '../services/api';
import { Shelter, RoadSegment } from '@relief-os/shared';
import {
  AlertTriangle,
  Building2,
  Navigation,
  MapPin,
  Users,
  Search,
  RefreshCw,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  LifeBuoy,
  HeartPulse,
  Droplets,
  UtensilsCrossed,
  Sparkles,
} from 'lucide-react';

export function CitizenPortalPage() {
  const { user } = useAuth();

  // Core Data States
  const [shelters, setShelters] = useState<
    Array<Shelter & { available_spaces: number; occupancy_pct: number; is_overcrowded: boolean }>
  >([]);
  const [roads, setRoads] = useState<RoadSegment[]>([]);
  const [activeDisasterName, setActiveDisasterName] = useState<string>('Assam Flood Response');
  const [activeDisasterRegion, setActiveDisasterRegion] = useState<string>('Barpeta District');

  // Loading & Error States
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Shelter Search & Filter State
  const [shelterSearch, setShelterSearch] = useState<string>('');
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);

  // Smart Shelter Suggestion for Family State
  const [familyMembers, setFamilyMembers] = useState<number>(4);
  const [suggesting, setSuggesting] = useState<boolean>(false);
  const [familySuggestions, setFamilySuggestions] = useState<ShelterSuggestionItem[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // Road Filter State
  const [roadFilter, setRoadFilter] = useState<'all' | 'accessible' | 'blocked' | 'partial'>('all');

  // Distress Report Modal State
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [reportCategory, setReportCategory] = useState<string>('rescue');
  const [reportDesc, setReportDesc] = useState<string>('');
  const [reportLocation, setReportLocation] = useState<string>('Barpeta Town');
  const [reportPeople, setReportPeople] = useState<number>(4);
  const [reportMedical, setReportMedical] = useState<boolean>(false);
  const [reportPhone, setReportPhone] = useState<string>('');
  const [reportSubmitting, setReportSubmitting] = useState<boolean>(false);
  const [reportSuccessId, setReportSuccessId] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  // Load live citizen data from backend
  const loadCitizenData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sheltersRes, roadsRes, demoKPIs] = await Promise.all([
        api.getShelters({ limit: 50 }),
        api.getRoadSegments(),
        api.getDemoKPIs().catch(() => null),
      ]);

      setShelters(sheltersRes.items);
      setRoads(roadsRes.items);
      if (demoKPIs) {
        setActiveDisasterName(demoKPIs.disaster_name || 'Assam Flood Response');
        setActiveDisasterRegion('Barpeta District');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? `${err.message} (HTTP ${err.status})`
          : err instanceof Error
          ? err.message
          : 'Unable to reach emergency services database';
      setError(`Emergency Network Offline: ${msg}. Please check your connection and retry.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCitizenData();
  }, [loadCitizenData]);

  // Handle Smart Shelter Suggestion for Citizen's Family
  const handleFindFamilyShelter = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuggesting(true);
    setSuggestError(null);
    setFamilySuggestions([]);

    try {
      const count = Math.max(1, familyMembers);
      const res = await api.suggestShelters({ people: count, limit: 3 });
      setFamilySuggestions(res.suggestions);
    } catch (err: unknown) {
      setSuggestError('Unable to calculate shelter suggestions right now. Please browse the list below.');
    } finally {
      setSuggesting(false);
    }
  };

  // Handle In-Page Emergency Distress Submission
  const handleDistressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportError(null);
    setReportSuccessId(null);

    if (!reportDesc.trim()) {
      setReportError('Please describe your emergency or current situation.');
      return;
    }

    setReportSubmitting(true);
    try {
      const payload: CreateReportPayload = {
        description: reportDesc.trim(),
        location_name: reportLocation.trim() || 'Barpeta District',
        lat: 26.3211,
        lng: 91.0045,
        severity: reportMedical ? 'critical' : 'high',
        category: reportCategory,
        people_affected: reportPeople > 0 ? reportPeople : 1,
        medical_need: reportMedical,
        contact_number: reportPhone.trim() || undefined,
        is_simulated: false,
      };

      const res = await api.submitReport(payload);
      setReportSuccessId(res.id);
      setReportDesc('');
      setReportPhone('');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to submit distress report. Please try again.';
      setReportError(msg);
    } finally {
      setReportSubmitting(false);
    }
  };

  // Filtered Shelters
  const filteredShelters = useMemo(() => {
    return shelters.filter((shelter) => {
      const matchesSearch =
        shelterSearch.trim() === '' ||
        shelter.name.toLowerCase().includes(shelterSearch.toLowerCase()) ||
        shelter.facilities.some((f) => f.toLowerCase().includes(shelterSearch.toLowerCase()));

      const matchesAvailable = !availableOnly || shelter.available_spaces > 0;
      return matchesSearch && matchesAvailable;
    });
  }, [shelters, shelterSearch, availableOnly]);

  // Filtered Roads
  const filteredRoads = useMemo(() => {
    if (roadFilter === 'all') return roads;
    return roads.filter((r) => r.status === roadFilter);
  }, [roads, roadFilter]);

  // Road status summary counts
  const roadCounts = useMemo(() => {
    return {
      all: roads.length,
      accessible: roads.filter((r) => r.status === 'accessible').length,
      partial: roads.filter((r) => r.status === 'partial').length,
      blocked: roads.filter((r) => r.status === 'blocked').length,
    };
  }, [roads]);

  // Blocked and hazardous roads for verified alerts
  const hazardousRoads = useMemo(() => {
    return roads.filter((r) => r.status === 'blocked' || r.status === 'partial');
  }, [roads]);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200 flex flex-col justify-between selection:bg-cyan-500 selection:text-black">
      <NavigationHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* 1. Welcome & Immediate Action Section */}
        <section className="bg-gradient-to-r from-[#0d1522] via-[#131e31] to-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-950 text-teal-300 border border-teal-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>VERIFIED CITIZEN ACCOUNT</span>
                </span>
                <span className="text-xs text-slate-400">
                  {activeDisasterRegion} Safety Network
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Welcome, {user?.name || 'Citizen'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                This portal connects you to verified emergency shelters with live capacity, safe road conditions, and emergency rescue dispatch. Stay safe and monitor official alerts below.
              </p>
            </div>

            {/* Primary Distress Call-To-Action */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowReportModal(true);
                  setReportSuccessId(null);
                  setReportError(null);
                }}
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-950/50 flex items-center justify-center gap-2.5 transition transform active:scale-95 cursor-pointer"
              >
                <AlertTriangle className="w-5 h-5 text-slate-950 shrink-0" />
                <span>Request Immediate Assistance</span>
              </button>

              <button
                type="button"
                onClick={loadCitizenData}
                disabled={loading}
                className="px-4 py-3.5 rounded-xl bg-[#131e31] hover:bg-[#1a2842] border border-[#1f2e48] text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                title="Sync with emergency database"
              >
                <RefreshCw className={`w-4 h-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh Data</span>
              </button>
            </div>
          </div>
        </section>

        {/* 2. Error Banner & Retry Action */}
        {error && (
          <div className="p-5 rounded-2xl bg-red-950/50 border border-red-800 text-red-200 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-white text-sm">Unable to Sync Safety Information</h4>
                <p className="text-xs text-red-300/90 mt-0.5">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadCitizenData}
              className="px-4 py-2 rounded-xl bg-red-800 hover:bg-red-700 text-white font-bold text-xs transition shrink-0 cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* 3. Verified Emergency Advisories & Live Warnings */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-bold tracking-wider text-slate-300 uppercase flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Official Public Emergency Advisories</span>
            </h2>
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Emergency Feed</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active Disaster Regional Warning */}
            <div className="bg-[#0d1522] border border-amber-500/30 rounded-xl p-4 flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-amber-950/60 border border-amber-700/60 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{activeDisasterName}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 uppercase">
                    ACTIVE
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Severe flood wave active across {activeDisasterRegion}. Rising water levels reported near low-lying riverbanks. Follow DDMA evacuation alerts.
                </p>
              </div>
            </div>

            {/* Live Road Hazard Advisory */}
            <div className="bg-[#0d1522] border border-red-500/30 rounded-xl p-4 flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-red-950/60 border border-red-700/60 flex items-center justify-center shrink-0">
                <Navigation className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">Travel Hazard Advisory</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800 uppercase">
                    {hazardousRoads.length} RISKS
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {hazardousRoads.length > 0
                    ? `Warning: ${hazardousRoads.map((r) => r.name).join(', ')} reported as blocked or hazardous due to floodwater. Avoid travel on these routes.`
                    : 'All monitored evacuation corridors are currently open and clear for travel.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Smart Family Shelter Finder Card */}
        <section className="bg-gradient-to-r from-blue-950/20 via-[#0d1522] to-cyan-950/20 border border-cyan-800/40 rounded-2xl p-6 shadow-xl">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Find a Shelter for Your Family</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Enter the number of people with you. We will check live capacity and recommend the best open shelter nearby.
              </p>
            </div>
          </div>

          <form onSubmit={handleFindFamilyShelter} className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Users className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="number"
                min={1}
                max={50}
                value={familyMembers}
                onChange={(e) => setFamilyMembers(parseInt(e.target.value, 10) || 1)}
                placeholder="Number of people"
                className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={suggesting}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {suggesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Searching shelters...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Check Open Spaces</span>
                </>
              )}
            </button>
          </form>

          {suggestError && (
            <p className="text-xs text-red-300 mt-3">{suggestError}</p>
          )}

          {/* Family Recommendation Result Cards */}
          {familySuggestions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#1f2e48] space-y-3">
              <div className="text-xs font-semibold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                <span>Recommended Shelters for {familyMembers} People</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {familySuggestions.map((sug) => (
                  <div
                    key={sug.id}
                    className="bg-[#131e31] border border-cyan-500/50 rounded-xl p-4 shadow-lg space-y-2 relative"
                  >
                    {sug.recommended && (
                      <span className="absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-700">
                        BEST MATCH
                      </span>
                    )}
                    <h4 className="font-bold text-white text-sm pr-16">{sug.name}</h4>
                    <p className="text-xs text-slate-300">{sug.evacuation_note}</p>
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                      <span>Available: <strong className="text-emerald-400">{sug.available_spaces} beds</strong></span>
                      <span>Distance: <strong className="text-slate-200">{sug.distance_km} km</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 5. Safe Shelter Directory */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                <Building2 className="w-5 h-5 text-cyan-400" />
                <span>Emergency Shelters &amp; Relief Camps</span>
              </h2>
              <p className="text-xs text-slate-400">
                Official camps providing food, safe drinking water, and medical aid. Showing live occupancy.
              </p>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={shelterSearch}
                  onChange={(e) => setShelterSearch(e.target.value)}
                  placeholder="Search shelter name..."
                  className="bg-[#0d1522] border border-[#1f2e48] focus:border-cyan-500 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none w-full xs:w-48"
                />
              </div>

              <label className="flex items-center gap-2 bg-[#0d1522] border border-[#1f2e48] rounded-xl px-3 py-1.5 text-xs text-slate-300 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span>Available Only</span>
              </label>
            </div>
          </div>

          {/* Shelters Loading State */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-3 animate-pulse">
                  <div className="h-4 bg-[#1f2e48] rounded w-3/4" />
                  <div className="h-3 bg-[#131e31] rounded w-1/2" />
                  <div className="h-2 bg-[#131e31] rounded w-full" />
                </div>
              ))}
            </div>
          )}

          {/* Shelters Empty State */}
          {!loading && filteredShelters.length === 0 && (
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-8 text-center space-y-2">
              <Building2 className="w-8 h-8 text-slate-600 mx-auto" />
              <h4 className="font-bold text-white text-sm">No Shelters Match Your Criteria</h4>
              <p className="text-xs text-slate-400">
                Try clearing your search query or unchecking "Available Only" to view all registered shelters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setShelterSearch('');
                  setAvailableOnly(false);
                }}
                className="mt-2 text-xs text-cyan-400 hover:underline font-semibold cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Shelters Cards Grid */}
          {!loading && filteredShelters.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredShelters.map((shelter) => {
                const isFull = shelter.available_spaces === 0;
                const isNearFull = !isFull && shelter.occupancy_pct >= 80;

                return (
                  <div
                    key={shelter.id}
                    className="bg-[#0d1522] border border-[#1f2e48] hover:border-slate-600 rounded-xl p-5 space-y-3 transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Shelter Name & Status Badge */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-bold text-white text-sm line-clamp-2">
                          {shelter.name}
                        </h4>
                        {isFull ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 shrink-0">
                            FULL
                          </span>
                        ) : isNearFull ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 shrink-0">
                            FILLING FAST
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                            AVAILABLE
                          </span>
                        )}
                      </div>

                      {/* Location Coordinates / Tag */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Lat {shelter.location_lat.toFixed(3)}, Lng {shelter.location_lng.toFixed(3)}</span>
                      </div>

                      {/* Capacity Metrics */}
                      <div className="bg-[#131e31] rounded-lg p-2.5 border border-[#1f2e48] space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Available Spaces:</span>
                          <span className={`font-bold ${isFull ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {shelter.available_spaces} beds
                          </span>
                        </div>

                        {/* Occupancy Progress Bar */}
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              isFull ? 'bg-rose-500' : isNearFull ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, shelter.occupancy_pct)}%` }}
                          />
                        </div>

                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Occupied: {shelter.occupied} / {shelter.capacity}</span>
                          <span>{shelter.occupancy_pct}% full</span>
                        </div>
                      </div>
                    </div>

                    {/* Facilities Chips */}
                    {shelter.facilities && shelter.facilities.length > 0 && (
                      <div className="pt-2 border-t border-[#1f2e48]/60">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
                          Available Facilities
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {shelter.facilities.map((fac, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded text-[10px] bg-[#1a2842] text-slate-300 border border-[#263a60]"
                            >
                              {fac}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 6. Road Accessibility & Route Safety */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                <Navigation className="w-5 h-5 text-emerald-400" />
                <span>Road Conditions &amp; Travel Safety</span>
              </h2>
              <p className="text-xs text-slate-400">
                Verified status of main highway and road corridors. Avoid traveling on flooded routes.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-[#0d1522] border border-[#1f2e48] p-1 rounded-xl text-xs overflow-x-auto">
              <button
                type="button"
                onClick={() => setRoadFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  roadFilter === 'all' ? 'bg-[#1f2e48] text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                All Routes ({roadCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setRoadFilter('accessible')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  roadFilter === 'accessible' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-slate-400 hover:text-white'
                }`}
              >
                Open ({roadCounts.accessible})
              </button>
              <button
                type="button"
                onClick={() => setRoadFilter('partial')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  roadFilter === 'partial' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'text-slate-400 hover:text-white'
                }`}
              >
                Caution ({roadCounts.partial})
              </button>
              <button
                type="button"
                onClick={() => setRoadFilter('blocked')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  roadFilter === 'blocked' ? 'bg-red-950 text-red-300 border border-red-800' : 'text-slate-400 hover:text-white'
                }`}
              >
                Closed ({roadCounts.blocked})
              </button>
            </div>
          </div>

          {/* Roads Loading State */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-3 animate-pulse">
                  <div className="h-4 bg-[#1f2e48] rounded w-3/4" />
                  <div className="h-3 bg-[#131e31] rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Roads Empty State */}
          {!loading && filteredRoads.length === 0 && (
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-8 text-center space-y-2">
              <Navigation className="w-8 h-8 text-slate-600 mx-auto" />
              <h4 className="font-bold text-white text-sm">No Routes Under Selected Filter</h4>
              <p className="text-xs text-slate-400">
                Switch back to "All Routes" to review the status of every monitored segment.
              </p>
              <button
                type="button"
                onClick={() => setRoadFilter('all')}
                className="mt-2 text-xs text-cyan-400 hover:underline font-semibold cursor-pointer"
              >
                Show all routes
              </button>
            </div>
          )}

          {/* Roads Cards Grid */}
          {!loading && filteredRoads.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRoads.map((road) => {
                const isBlocked = road.status === 'blocked';
                const isPartial = road.status === 'partial';

                return (
                  <div
                    key={road.id}
                    className={`bg-[#0d1522] border rounded-xl p-5 space-y-3 transition ${
                      isBlocked
                        ? 'border-red-500/40'
                        : isPartial
                        ? 'border-amber-500/40'
                        : 'border-emerald-500/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-white text-sm">{road.name}</h4>
                      {isBlocked ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800 shrink-0">
                          CLOSED / FLOODED
                        </span>
                      ) : isPartial ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 shrink-0">
                          CAUTION
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                          OPEN / CLEAR
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {isBlocked && 'Impasse reported: Deep standing water or wash-out. Do not attempt crossing.'}
                      {isPartial && 'Partially flooded or shoulder damage. High-clearance and rescue vehicles only.'}
                      {!isBlocked && !isPartial && 'Traversable and open. Keep headlights on and obey field marshals.'}
                    </p>

                    <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-[#1f2e48]">
                      <span>Length: {road.length_km} km</span>
                      <span className="font-mono text-[11px] text-slate-400">ID: {road.id}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 7. Official Emergency Contact Hotline Numbers */}
        <section className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-cyan-400" />
            <span>Emergency Responders Helpline Directory</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48]">
              <div className="text-slate-400">National Disaster Helpline</div>
              <div className="text-base font-bold text-white mt-1">1070 / 112</div>
            </div>
            <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48]">
              <div className="text-slate-400">Ambulance &amp; Medical</div>
              <div className="text-base font-bold text-white mt-1">108</div>
            </div>
            <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48]">
              <div className="text-slate-400">State Disaster Control</div>
              <div className="text-base font-bold text-white mt-1">1079</div>
            </div>
            <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48]">
              <div className="text-slate-400">Barpeta District HQ</div>
              <div className="text-base font-bold text-white mt-1">03665-252125</div>
            </div>
          </div>
        </section>
      </main>

      {/* 8. In-Page Emergency Distress Reporting Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0d1522] border border-amber-500/50 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-950/60 to-[#0d1522] border-b border-[#1f2e48] p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">Request Emergency Assistance</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#131e31] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content / Form */}
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {reportSuccessId ? (
                <div className="p-5 rounded-xl bg-emerald-950/40 border border-emerald-500/60 text-emerald-200 text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <h4 className="text-base font-bold text-white">Emergency Request Registered</h4>
                  <p className="text-xs text-slate-300">
                    Your distress signal has been ingested with reference ID{' '}
                    <span className="font-mono font-bold text-white bg-emerald-950 px-2 py-0.5 rounded border border-emerald-700">
                      {reportSuccessId}
                    </span>.
                    Emergency dispatchers have been alerted to your location.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReportModal(false);
                      setReportSuccessId(null);
                    }}
                    className="mt-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
                  >
                    Close Window
                  </button>
                </div>
              ) : (
                <form onSubmit={handleDistressSubmit} className="space-y-4">
                  {reportError && (
                    <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{reportError}</span>
                    </div>
                  )}

                  {/* Primary Need Selection Chips */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                      What is your most urgent need?
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'rescue', label: 'Rescue Boat', icon: LifeBuoy },
                        { id: 'medicine', label: 'Medical Aid', icon: HeartPulse },
                        { id: 'water', label: 'Drinking Water', icon: Droplets },
                        { id: 'food', label: 'Food Rations', icon: UtensilsCrossed },
                        { id: 'shelter', label: 'Safe Shelter', icon: Building2 },
                        { id: 'transportation', label: 'Evacuation', icon: Navigation },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = reportCategory === item.id;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => setReportCategory(item.id)}
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                              isSelected
                                ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow'
                                : 'bg-[#131e31] border-[#1f2e48] text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0 text-amber-400" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                      Describe your situation &amp; surroundings <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={reportDesc}
                      onChange={(e) => setReportDesc(e.target.value)}
                      placeholder="e.g. Stranded on second floor, water level at 4 feet, 2 elderly residents..."
                      className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-amber-500 rounded-xl p-3 text-xs text-white placeholder-slate-500 outline-none"
                    />
                  </div>

                  {/* Landmark Location & Phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Location / Landmark
                      </label>
                      <input
                        type="text"
                        value={reportLocation}
                        onChange={(e) => setReportLocation(e.target.value)}
                        placeholder="Village, road or building"
                        className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl px-3 py-2 text-xs text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Contact Phone (Optional)
                      </label>
                      <input
                        type="tel"
                        value={reportPhone}
                        onChange={(e) => setReportPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl px-3 py-2 text-xs text-white outline-none"
                      />
                    </div>
                  </div>

                  {/* People count & Medical Urgent Checkbox */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Number of People with You
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={reportPeople}
                        onChange={(e) => setReportPeople(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl px-3 py-2 text-xs text-white outline-none"
                      />
                    </div>
                    <div className="pt-4">
                      <label className="flex items-center gap-2 bg-[#131e31] border border-[#1f2e48] p-2.5 rounded-xl text-xs text-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={reportMedical}
                          onChange={(e) => setReportMedical(e.target.checked)}
                          className="rounded bg-slate-900 border-slate-700 text-red-500 focus:ring-0"
                        />
                        <span className="font-semibold text-rose-300">Urgent Medical Condition</span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowReportModal(false)}
                      className="px-4 py-2 rounded-xl bg-[#131e31] text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={reportSubmitting}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {reportSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Transmitting signal...</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-slate-950" />
                          <span>Dispatch Distress Request</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#1f2e48] bg-[#0d1522] px-6 py-4 text-center text-xs text-slate-500">
        AAROH &copy; 2026 &bull; Public Emergency Response &amp; Citizen Safety Network.
      </footer>
    </div>
  );
}

export default CitizenPortalPage;
