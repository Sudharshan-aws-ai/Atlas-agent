import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';

interface PatientItem {
  usubjid: string;
  siteid: string;
  diseases: string[];
  records_count: number;
}

interface DiseaseItem {
  name: string;
  category: string;
  domain: string;
  patient_count: number;
  patients: string[];
  records: any[];
}

interface RelationshipItem {
  usubjid: string;
  siteid: string;
  disease: string;
  domain: string;
  seq: number;
  record_ref: string;
  category: string;
  cut_available: number;
  evidence: string;
  severity?: string;
  serious?: string;
  hospitalized?: string;
}

interface GraphData {
  total_patients: number;
  total_diseases: number;
  total_relationships: number;
  patients: PatientItem[];
  diseases: DiseaseItem[];
  relationships: RelationshipItem[];
}

export default function PatientDiseaseGraph() {
  const navigate = useNavigate();
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [patientLimit, setPatientLimit] = useState<number>(30);
  const [page, setPage] = useState<number>(0);

  // Interaction State
  const [selectedPatient, setSelectedPatient] = useState<PatientItem | null>(null);
  const [selectedDisease, setSelectedDisease] = useState<DiseaseItem | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState<RelationshipItem | null>(null);

  const [hoveredPatient, setHoveredPatient] = useState<string | null>(null);
  const [hoveredDisease, setHoveredDisease] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadGraph() {
      setLoading(true);
      setError(null);
      try {
        const resp = await api.patientDiseaseGraph();
        if (isMounted) {
          setData(resp);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load patient-disease graph');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadGraph();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filtered diseases
  const filteredDiseases = useMemo(() => {
    if (!data) return [];
    return data.diseases.filter(d => {
      if (categoryFilter !== 'ALL' && d.category !== categoryFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return d.name.toLowerCase().includes(term);
      }
      return true;
    });
  }, [data, categoryFilter, searchTerm]);

  // Filtered patients
  const filteredPatients = useMemo(() => {
    if (!data) return [];
    return data.patients.filter(p => {
      if (siteFilter !== 'ALL' && p.siteid !== siteFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          p.usubjid.toLowerCase().includes(term) ||
          p.diseases.some(d => d.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [data, siteFilter, searchTerm]);

  // Paginated patients for viewability
  const displayedPatients = useMemo(() => {
    const start = page * patientLimit;
    return filteredPatients.slice(start, start + patientLimit);
  }, [filteredPatients, page, patientLimit]);

  // Map of relationships for O(1) cell lookup
  const relationshipMap = useMemo(() => {
    const map = new Map<string, RelationshipItem>();
    if (!data) return map;
    for (const r of data.relationships) {
      map.set(`${r.usubjid}|${r.disease}`, r);
    }
    return map;
  }, [data]);

  const totalPages = Math.ceil(filteredPatients.length / patientLimit);

  if (loading) {
    return (
      <div className="card p-8 text-center space-y-3">
        <div className="inline-block w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-sm font-semibold text-gray-700">Loading Patient–Disease Knowledge Graph...</div>
        <div className="text-xs text-gray-500 font-mono">Parsing Medical History (MH) and Adverse Events (AE) relationships</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-6 border-l-4 border-rose-600 bg-rose-50 text-rose-800 text-sm">
        <div className="font-bold">Error Loading Patient–Disease Graph</div>
        <p className="mt-1 text-xs">{error || 'Unable to retrieve dataset records.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Metric Cards */}
      <div className="card p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-0 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-mono uppercase tracking-widest text-indigo-300 font-bold">
                Clinical Knowledge Topology
              </span>
            </div>
            <h2 className="text-xl font-black tracking-tight text-white mt-1">
              PATIENTS ↔️ DISEASES DYNAMIC GRAPH
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Visual correlation matrix mapping patient cohorts to diagnosed medical conditions and clinical events,
              derived directly from verified study dataset domains <span className="font-mono text-amber-300">MH</span> and{' '}
              <span className="font-mono text-rose-300">AE</span>.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-white/10 backdrop-blur-xs p-2.5 rounded-lg border border-white/10">
              <div className="text-slate-400 text-[10px] font-bold uppercase">Total Patients</div>
              <div className="text-xl font-mono font-black text-white mt-0.5">{data.total_patients}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-xs p-2.5 rounded-lg border border-white/10">
              <div className="text-slate-400 text-[10px] font-bold uppercase">Clinical Diseases</div>
              <div className="text-xl font-mono font-black text-indigo-300 mt-0.5">{data.total_diseases}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-xs p-2.5 rounded-lg border border-white/10">
              <div className="text-slate-400 text-[10px] font-bold uppercase">Relationships</div>
              <div className="text-xl font-mono font-black text-emerald-400 mt-0.5">{data.total_relationships}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Category, Site, Search, and Pagination */}
      <div className="card p-4 space-y-3 bg-white border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Domain Category Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">Category:</span>
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-gray-50">
              {[
                { key: 'ALL', label: 'All Conditions' },
                { key: 'Medical History', label: 'Medical History (MH)' },
                { key: 'Adverse Event', label: 'Adverse Events (AE)' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setCategoryFilter(opt.key);
                    setPage(0);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    categoryFilter === opt.key ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Site Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">Site:</span>
            <select
              value={siteFilter}
              onChange={e => {
                setSiteFilter(e.target.value);
                setPage(0);
              }}
              className="border border-gray-300 rounded px-2.5 py-1 bg-white font-medium text-xs text-gray-800"
            >
              <option value="ALL">All Sites (S01 - S12)</option>
              {Array.from({ length: 12 }, (_, i) => {
                const s = `S${String(i + 1).padStart(2, '0')}`;
                return (
                  <option key={s} value={s}>
                    Site {s}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Search Box */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search patient, disease..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setPage(0);
              }}
              className="border border-gray-300 rounded px-3 py-1 text-xs w-48 focus:ring-1 focus:ring-indigo-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-gray-400 hover:text-gray-600 font-bold px-1"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Pagination & Display Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 text-[11px] text-gray-600">
          <div className="flex items-center gap-2">
            <span>
              Showing patients <strong className="text-gray-900">{page * patientLimit + 1}</strong> to{' '}
              <strong className="text-gray-900">{Math.min((page + 1) * patientLimit, filteredPatients.length)}</strong> of{' '}
              <strong className="text-gray-900">{filteredPatients.length}</strong> matching cohort
            </span>
            <span>·</span>
            <span>
              <strong className="text-gray-900">{filteredDiseases.length}</strong> active diseases on Y-axis
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span>Cohort view limit:</span>
            <select
              value={patientLimit}
              onChange={e => {
                setPatientLimit(Number(e.target.value));
                setPage(0);
              }}
              className="border border-gray-300 rounded px-1.5 py-0.5 bg-white font-medium text-[11px]"
            >
              <option value={20}>20 patients</option>
              <option value={30}>30 patients</option>
              <option value={50}>50 patients</option>
              <option value={100}>100 patients</option>
            </select>

            {totalPages > 1 && (
              <div className="flex items-center gap-1 ml-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  className="px-2 py-0.5 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50 font-bold"
                >
                  ← Prev
                </button>
                <span className="font-mono px-1">
                  {page + 1} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  className="px-2 py-0.5 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50 font-bold"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Graph Grid (X-axis = Patients, Y-axis = Diseases) */}
      <div className="card p-0 overflow-hidden border border-slate-200 shadow-xs bg-white">
        <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-slate-900 uppercase tracking-wider text-xs">
              Y-Axis: Diseases ↑ · X-Axis: Patients →
            </span>
            <span className="text-slate-500 font-medium">Click any dot (●), patient, or disease to inspect verified evidence</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
              <span className="text-slate-700">Medical History (MH)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
              <span className="text-slate-700">Adverse Event (AE)</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-w-full bg-white">
          <table className="w-full border-collapse text-xs select-none bg-white">
            <thead>
              <tr className="bg-white border-b border-slate-200">
                {/* Y-axis column header */}
                <th className="sticky left-0 z-20 bg-white border-r border-slate-200 py-3.5 px-3.5 text-left font-bold text-slate-900 uppercase tracking-wider text-xs min-w-[220px] shadow-xs">
                  <div className="flex items-center justify-between">
                    <span>DISEASES (Y-AXIS)</span>
                    <span className="text-[10px] text-slate-400 font-mono">Cohort Count</span>
                  </div>
                </th>

                {/* X-axis patient headers */}
                {displayedPatients.map(p => {
                  const isHovered = hoveredPatient === p.usubjid;
                  const isSelected = selectedPatient?.usubjid === p.usubjid;
                  return (
                    <th
                      key={p.usubjid}
                      onMouseEnter={() => setHoveredPatient(p.usubjid)}
                      onMouseLeave={() => setHoveredPatient(null)}
                      onClick={() => {
                        setSelectedPatient(p);
                        setSelectedDisease(null);
                        setSelectedRelationship(null);
                      }}
                      className={`py-3 px-2 text-center font-mono font-bold text-[10.5px] border-r border-gray-200 cursor-pointer transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : isHovered
                          ? 'bg-blue-100 text-blue-900'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      title={`Click to inspect patient ${p.usubjid} (Site ${p.siteid})`}
                    >
                      <div>{p.usubjid.replace('042-', '')}</div>
                      <div className={`text-[9px] font-sans font-semibold mt-0.5 ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                        {p.siteid}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDiseases.map((d, dIdx) => {
                const isDiseaseHovered = hoveredDisease === d.name;
                const isDiseaseSelected = selectedDisease?.name === d.name;
                const isMh = d.category === 'Medical History';

                return (
                  <tr
                    key={d.name}
                    className={`transition-colors ${
                      isDiseaseSelected
                        ? 'bg-indigo-50/90'
                        : isDiseaseHovered
                        ? 'bg-indigo-50/40'
                        : dIdx % 2 === 0
                        ? 'bg-white'
                        : 'bg-slate-50/40'
                    }`}
                  >
                    {/* Y-axis Disease label */}
                    <td
                      onMouseEnter={() => setHoveredDisease(d.name)}
                      onMouseLeave={() => setHoveredDisease(null)}
                      onClick={() => {
                        setSelectedDisease(d);
                        setSelectedPatient(null);
                        setSelectedRelationship(null);
                      }}
                      className={`sticky left-0 z-10 py-2.5 px-3 border-r border-gray-300 font-medium cursor-pointer transition-colors shadow-xs ${
                        isDiseaseSelected
                          ? 'bg-indigo-900 text-white font-bold'
                          : isDiseaseHovered
                          ? 'bg-indigo-100 text-indigo-950 font-semibold'
                          : 'bg-white text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${isMh ? 'bg-indigo-600' : 'bg-rose-600'}`}
                          ></span>
                          <span className="truncate text-xs font-semibold" title={d.name}>
                            {d.name}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                            isDiseaseSelected
                              ? 'bg-indigo-800 text-indigo-100'
                              : 'bg-slate-100 text-gray-700 border border-gray-200'
                          }`}
                        >
                          {d.patient_count} pts
                        </span>
                      </div>
                    </td>

                    {/* Intersection Cells (Patient, Disease) */}
                    {displayedPatients.map(p => {
                      const rel = relationshipMap.get(`${p.usubjid}|${d.name}`);
                      const hasRelation = !!rel;
                      const isColHovered = hoveredPatient === p.usubjid;
                      const isRowHovered = isDiseaseHovered;
                      const isCellSelected =
                        selectedRelationship?.usubjid === p.usubjid && selectedRelationship?.disease === d.name;

                      return (
                        <td
                          key={p.usubjid}
                          onClick={() => {
                            if (rel) {
                              setSelectedRelationship(rel);
                              setSelectedPatient(p);
                              setSelectedDisease(d);
                            } else {
                              setSelectedPatient(p);
                              setSelectedDisease(d);
                              setSelectedRelationship(null);
                            }
                          }}
                          onMouseEnter={() => {
                            setHoveredPatient(p.usubjid);
                            setHoveredDisease(d.name);
                          }}
                          onMouseLeave={() => {
                            setHoveredPatient(null);
                            setHoveredDisease(null);
                          }}
                          className={`py-2 px-1 text-center border-r border-gray-100 transition-all cursor-pointer ${
                            isCellSelected
                              ? 'bg-amber-100 ring-2 ring-amber-500'
                              : isColHovered && isRowHovered
                              ? 'bg-indigo-100/80'
                              : isColHovered
                              ? 'bg-blue-50/50'
                              : isRowHovered
                              ? 'bg-indigo-50/50'
                              : ''
                          }`}
                        >
                          {hasRelation ? (
                            <div className="flex items-center justify-center">
                              <span
                                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-transform transform hover:scale-130 shadow-xs ${
                                  rel.domain === 'MH'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-rose-600 text-white'
                                }`}
                                title={`Verified relationship: ${p.usubjid} ↔️ ${d.name} (${rel.record_ref})`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-200 text-[10px]">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dynamic Detail & Dataset Evidence Inspector Panel */}
      {(selectedRelationship || selectedPatient || selectedDisease) && (
        <div className="card p-5 space-y-4 border-l-4 border-indigo-600 bg-white shadow-md animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block"></span>
              <h3 className="text-sm font-bold text-gray-900 tracking-tight">
                {selectedRelationship
                  ? 'PATIENT ↔️ DISEASE VERIFIED EVIDENCE'
                  : selectedPatient
                  ? `PATIENT PROFILE — ${selectedPatient.usubjid}`
                  : `DISEASE CORRELATION — ${selectedDisease?.name}`}
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedRelationship(null);
                setSelectedPatient(null);
                setSelectedDisease(null);
              }}
              className="text-gray-400 hover:text-gray-600 text-sm font-bold px-2 py-0.5 rounded"
            >
              ✕ Close
            </button>
          </div>

          {/* Context 1: Specific Relationship Selected (Dot Click) */}
          {selectedRelationship && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg">
                <div>
                  <span className="text-gray-500 font-semibold block text-[10px] uppercase">Subject ID</span>
                  <span className="font-mono font-bold text-blue-900 text-sm">{selectedRelationship.usubjid}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-semibold block text-[10px] uppercase">Hospital Site</span>
                  <span className="font-bold text-gray-900 text-sm">Site {selectedRelationship.siteid}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-semibold block text-[10px] uppercase">Clinical Disease</span>
                  <span className="font-bold text-indigo-900 text-sm">{selectedRelationship.disease}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-semibold block text-[10px] uppercase">Source RecordRef</span>
                  <span className="font-mono font-bold text-purple-900 text-sm bg-purple-100 px-2 py-0.5 rounded inline-block">
                    {selectedRelationship.record_ref}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-900 uppercase text-[10px] tracking-wider">
                    Dataset Ground Truth Evidence (No Fake Data)
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                    Domain: {selectedRelationship.domain} · Cut {selectedRelationship.cut_available}
                  </span>
                </div>
                <p className="text-emerald-950 font-medium text-xs mt-1 leading-relaxed">
                  {selectedRelationship.evidence}
                </p>
                {selectedRelationship.severity && (
                  <div className="mt-2 text-[11px] text-gray-700 flex items-center gap-3">
                    <span>Severity: <strong>{selectedRelationship.severity}</strong></span>
                    <span>Serious: <strong>{selectedRelationship.serious}</strong></span>
                    <span>Hospitalized: <strong>{selectedRelationship.hospitalized}</strong></span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-gray-500 font-mono text-[11px]">
                  Triple Identity: {selectedRelationship.domain}|{selectedRelationship.usubjid}|{selectedRelationship.seq}
                </span>
                <button
                  onClick={() => navigate(`/patient360/${selectedRelationship.usubjid}`)}
                  className="btn-primary text-xs px-3 py-1 font-semibold"
                >
                  View in Patient 360 →
                </button>
              </div>
            </div>
          )}

          {/* Context 2: Patient Selected (Column Click) */}
          {selectedPatient && !selectedRelationship && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div>
                  <div className="text-[10px] text-blue-700 font-bold uppercase">Universal Subject ID</div>
                  <div className="text-base font-mono font-black text-blue-950">{selectedPatient.usubjid}</div>
                  <div className="text-gray-600 mt-0.5">Enrolled at Site {selectedPatient.siteid}</div>
                </div>
                <button
                  onClick={() => navigate(`/patient360/${selectedPatient.usubjid}`)}
                  className="btn-primary text-xs px-3 py-1.5 font-semibold"
                >
                  Open Full Patient 360 →
                </button>
              </div>

              <div>
                <div className="font-bold text-gray-800 text-xs mb-1.5">
                  Associated Diseases ({selectedPatient.diseases.length}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPatient.diseases.map(d => (
                    <span
                      key={d}
                      onClick={() => {
                        const matchRel = data.relationships.find(
                          r => r.usubjid === selectedPatient.usubjid && r.disease === d
                        );
                        if (matchRel) setSelectedRelationship(matchRel);
                      }}
                      className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-full font-semibold text-xs cursor-pointer hover:bg-indigo-100 flex items-center gap-1.5"
                    >
                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Context 3: Disease Selected (Row Click) */}
          {selectedDisease && !selectedRelationship && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-indigo-700 font-bold uppercase">Condition / Term</div>
                  <div className="text-base font-bold text-indigo-950">{selectedDisease.name}</div>
                  <div className="text-gray-600 text-xs mt-0.5">
                    Category: <strong className="text-gray-900">{selectedDisease.category}</strong> ({selectedDisease.domain} Domain)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-500 font-bold uppercase">Affected Cohort</div>
                  <div className="text-xl font-mono font-black text-indigo-900">{selectedDisease.patient_count} Patients</div>
                </div>
              </div>

              <div>
                <div className="font-bold text-gray-800 text-xs mb-1.5">
                  Patients Diagnosed / Experiencing this Condition:
                </div>
                <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto p-2 bg-gray-50 rounded border border-gray-200">
                  {selectedDisease.patients.map(pId => (
                    <span
                      key={pId}
                      onClick={() => {
                        const pat = data.patients.find(p => p.usubjid === pId);
                        if (pat) setSelectedPatient(pat);
                        const matchRel = data.relationships.find(
                          r => r.usubjid === pId && r.disease === selectedDisease.name
                        );
                        if (matchRel) setSelectedRelationship(matchRel);
                      }}
                      className="px-2 py-0.5 bg-white border border-gray-300 text-gray-800 font-mono text-[11px] rounded hover:border-blue-500 hover:text-blue-700 cursor-pointer"
                    >
                      {pId}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
