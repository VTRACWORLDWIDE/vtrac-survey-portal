import { useEffect, useMemo, useState } from 'react';
import { Download, LocateFixed, RefreshCw, Search, Send } from 'lucide-react';

const apiBase = import.meta.env.VITE_API_BASE || '';

export default function App() {
  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function navigate(path) {
    window.history.pushState({}, '', path);
    setRoute(path);
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">VTRAC</p>
          <h1>Survey Portal</h1>
        </div>
        <nav>
          <button className={route !== '/admin' ? 'active' : ''} onClick={() => navigate('/')}>Survey</button>
          <button className={route === '/admin' ? 'active' : ''} onClick={() => navigate('/admin')}>Admin</button>
        </nav>
      </header>
      {route === '/admin' ? <AdminDashboard /> : <SurveyForm />}
    </main>
  );
}

function SurveyForm() {
  const [config, setConfig] = useState({ locations: [], questions: [] });
  const [form, setForm] = useState({
    enumeratorName: '',
    location: '',
    respondentName: '',
    respondentPhone: '',
    householdId: '',
    answers: {}
  });
  const [gps, setGps] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('Not captured');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/survey-config`)
      .then((response) => response.json())
      .then(setConfig)
      .catch(() => setStatus('Unable to load survey questions.'));
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAnswer(questionId, value) {
    setForm((current) => ({
      ...current,
      answers: { ...current.answers, [questionId]: value }
    }));
  }

  function captureGps() {
    if (!navigator.geolocation) {
      setGpsStatus('GPS is not supported on this device.');
      return;
    }
    setGpsStatus('Capturing...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setGpsStatus(`Captured within ${Math.round(position.coords.accuracy)}m`);
      },
      () => setGpsStatus('GPS permission denied or unavailable.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      const response = await fetch(`${apiBase}/api/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, gps })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to submit survey.');
      setStatus(`Submitted successfully. Response ID: ${payload.response.id}`);
      setForm({
        enumeratorName: form.enumeratorName,
        location: form.location,
        respondentName: '',
        respondentPhone: '',
        householdId: '',
        answers: {}
      });
      setGps(null);
      setGpsStatus('Not captured');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-grid">
      <form className="panel form-panel" onSubmit={submit}>
        <div className="section-title">
          <h2>New Survey</h2>
          <p>{new Date().toLocaleString()}</p>
        </div>

        <label>
          Enumerator name
          <input value={form.enumeratorName} onChange={(event) => update('enumeratorName', event.target.value)} required />
        </label>

        <label>
          Survey location
          <select value={form.location} onChange={(event) => update('location', event.target.value)} required>
            <option value="">Select location</option>
            {config.locations.map((location) => <option key={location}>{location}</option>)}
          </select>
        </label>

        <div className="inline-grid">
          <label>
            Respondent name
            <input value={form.respondentName} onChange={(event) => update('respondentName', event.target.value)} />
          </label>
          <label>
            Phone
            <input inputMode="tel" value={form.respondentPhone} onChange={(event) => update('respondentPhone', event.target.value)} />
          </label>
        </div>

        <label>
          Household ID
          <input value={form.householdId} onChange={(event) => update('householdId', event.target.value)} />
        </label>

        <div className="gps-row">
          <div>
            <strong>GPS</strong>
            <span>{gpsStatus}</span>
          </div>
          <button type="button" className="icon-button" onClick={captureGps} aria-label="Capture GPS">
            <LocateFixed size={18} />
          </button>
        </div>

        {config.questions.map((question) => (
          <QuestionInput
            key={question.id}
            question={question}
            value={form.answers[question.id] || ''}
            onChange={(value) => updateAnswer(question.id, value)}
          />
        ))}

        <button className="primary" disabled={saving}>
          <Send size={18} />
          {saving ? 'Submitting...' : 'Submit Survey'}
        </button>
        {status && <p className="status">{status}</p>}
      </form>

      <aside className="panel quiet-panel">
        <h2>Phase 1 Pilot</h2>
        <p>This portal is intentionally simple: public collection, fixed questions, live dashboard, and export files for immediate review.</p>
        <div className="mini-list">
          <span>No login required</span>
          <span>Mobile responsive</span>
          <span>PostgreSQL backed</span>
          <span>CSV and Excel exports</span>
        </div>
      </aside>
    </section>
  );
}

function QuestionInput({ question, value, onChange }) {
  return (
    <label>
      {question.label}
      {question.type === 'textarea' && (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} required={question.required} />
      )}
      {question.type === 'select' && (
        <select value={value} onChange={(event) => onChange(event.target.value)} required={question.required}>
          <option value="">Select answer</option>
          {question.options.map((option) => <option key={option}>{option}</option>)}
        </select>
      )}
      {question.type === 'text' && (
        <input value={value} onChange={(event) => onChange(event.target.value)} required={question.required} />
      )}
    </label>
  );
}

function AdminDashboard() {
  const [filters, setFilters] = useState({ search: '', enumerator: '', location: '', dateFrom: '', dateTo: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/dashboard?${queryString}`);
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [queryString]);

  const exportPath = (type) => `${apiBase}/api/responses/export.${type}?${queryString}`;

  return (
    <section className="dashboard">
      <div className="panel filters">
        <label>
          <Search size={16} />
          <input placeholder="Search name, location, household" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} />
        </label>
        <input placeholder="Enumerator" value={filters.enumerator} onChange={(event) => updateFilter('enumerator', event.target.value)} />
        <input placeholder="Location" value={filters.location} onChange={(event) => updateFilter('location', event.target.value)} />
        <input type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} />
        <input type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} />
        <button className="icon-button" onClick={load} aria-label="Refresh dashboard"><RefreshCw size={18} /></button>
        <a className="download" href={exportPath('csv')}><Download size={16} /> CSV</a>
        <a className="download" href={exportPath('xlsx')}><Download size={16} /> Excel</a>
      </div>

      <div className="metric-grid">
        <Metric label="Total samples" value={data?.totals?.total_samples ?? 0} />
        <Metric label="Samples today" value={data?.totals?.samples_today ?? 0} />
        <Metric label="Enumerators" value={data?.byEnumerator?.length ?? 0} />
        <Metric label="Locations" value={data?.byLocation?.length ?? 0} />
      </div>

      <div className="chart-grid">
        <Breakdown title="Samples by date" rows={data?.byDate || []} labelKey="date" valueKey="samples" />
        <Breakdown title="Samples by enumerator" rows={data?.byEnumerator || []} labelKey="enumerator_name" valueKey="samples" />
        <Breakdown title="Samples by location" rows={data?.byLocation || []} labelKey="location" valueKey="samples" />
      </div>

      <div className="panel table-panel">
        <div className="section-title">
          <h2>Recent Submissions</h2>
          <p>{loading ? 'Refreshing...' : `${data?.recent?.length || 0} shown`}</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Submitted</th>
                <th>Enumerator</th>
                <th>Location</th>
                <th>Respondent</th>
                <th>Household</th>
                <th>GPS</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent || []).map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{new Date(row.submitted_at).toLocaleString()}</td>
                  <td>{row.enumerator_name}</td>
                  <td>{row.location}</td>
                  <td>{row.respondent_name || '-'}</td>
                  <td>{row.household_id || '-'}</td>
                  <td>{row.latitude && row.longitude ? `${row.latitude}, ${row.longitude}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Breakdown({ title, rows, labelKey, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey])), 1);
  return (
    <div className="panel breakdown">
      <h2>{title}</h2>
      {rows.length === 0 && <p className="empty">No samples yet.</p>}
      {rows.map((row) => (
        <div className="bar-row" key={row[labelKey]}>
          <span>{String(row[labelKey]).slice(0, 28)}</span>
          <div><i style={{ width: `${(Number(row[valueKey]) / max) * 100}%` }} /></div>
          <strong>{row[valueKey]}</strong>
        </div>
      ))}
    </div>
  );
}

