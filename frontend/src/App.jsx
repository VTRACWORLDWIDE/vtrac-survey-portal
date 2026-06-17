import { useEffect, useMemo, useState } from 'react';
import { Download, LocateFixed, Plus, RefreshCw, Save, Search, Send, Trash2 } from 'lucide-react';

const apiBase = import.meta.env.VITE_API_BASE || '';
const blankQuestion = { id: '', label: '', type: 'text', options: '', required: false };

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

  const publicSlug = route.startsWith('/p/') ? route.replace('/p/', '') : 'pilot-survey';

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">VTRAC</p>
          <h1>Survey Portal</h1>
        </div>
        <nav>
          <button className={!route.startsWith('/admin') ? 'active' : ''} onClick={() => navigate('/')}>Survey</button>
          <button className={route.startsWith('/admin') ? 'active' : ''} onClick={() => navigate('/admin')}>Admin</button>
        </nav>
      </header>
      {route.startsWith('/admin') ? <AdminApp /> : <SurveyForm projectSlug={publicSlug} />}
    </main>
  );
}

function SurveyForm({ projectSlug }) {
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
    fetch(`${apiBase}/api/survey-config?project=${encodeURIComponent(projectSlug)}`)
      .then((response) => response.json())
      .then((payload) => {
        setConfig(payload);
        if (payload.error) setStatus(payload.error);
      })
      .catch(() => setStatus('Unable to load survey questions.'));
  }, [projectSlug]);

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
        body: JSON.stringify({ ...form, projectSlug, gps })
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
          <div>
            <h2>{config.name || 'Survey'}</h2>
            <p>{new Date().toLocaleString()}</p>
          </div>
        </div>

        <label>
          Enumerator name
          <input value={form.enumeratorName} onChange={(event) => update('enumeratorName', event.target.value)} required />
        </label>

        <label>
          Survey location
          <select value={form.location} onChange={(event) => update('location', event.target.value)} required>
            <option value="">Select location</option>
            {(config.locations || []).map((location) => <option key={location}>{location}</option>)}
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

        {(config.questions || []).map((question) => (
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
        <h2>Public Collection</h2>
        <p>Enumerators can use this public link without logging in. Admin access is only required to create projects, edit forms, view results, and download data.</p>
        <div className="mini-list">
          <span>No enumerator login</span>
          <span>Project-specific form</span>
          <span>Optional mobile GPS</span>
          <span>Protected admin exports</span>
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
      {question.type === 'number' && (
        <input type="number" value={value} onChange={(event) => onChange(event.target.value)} required={question.required} />
      )}
      {question.type === 'date' && (
        <input type="date" value={value} onChange={(event) => onChange(event.target.value)} required={question.required} />
      )}
      {question.type === 'text' && (
        <input value={value} onChange={(event) => onChange(event.target.value)} required={question.required} />
      )}
    </label>
  );
}

function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem('vtracAdminToken') || '');

  function handleLogin(nextToken) {
    localStorage.setItem('vtracAdminToken', nextToken);
    setToken(nextToken);
  }

  function logout() {
    localStorage.removeItem('vtracAdminToken');
    setToken('');
  }

  if (!token) return <AdminLogin onLogin={handleLogin} />;
  return <AdminDashboard token={token} onLogout={logout} />;
}

function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  async function submit(event) {
    event.preventDefault();
    setStatus('');
    const response = await fetch(`${apiBase}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const payload = await response.json();
    if (!response.ok) return setStatus(payload.error || 'Unable to login.');
    onLogin(payload.token);
  }

  return (
    <section className="login-wrap">
      <form className="panel login-panel" onSubmit={submit}>
        <h2>Admin Login</h2>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button className="primary">Login</button>
        {status && <p className="status">{status}</p>}
      </form>
    </section>
  );
}

function AdminDashboard({ token, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ search: '', enumerator: '', location: '', dateFrom: '', dateTo: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const selectedProject = projects.find((project) => project.id === selectedId) || projects[0];
  const authHeaders = { Authorization: `Bearer ${token}` };

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedProject?.id) params.set('projectId', selectedProject.id);
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters, selectedProject?.id]);

  async function loadProjects() {
    const response = await fetch(`${apiBase}/api/projects`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    setProjects(payload.projects || []);
    setSelectedId((current) => current || payload.projects?.[0]?.id || '');
  }

  async function loadDashboard() {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/dashboard?${queryString}`, { headers: authHeaders });
      if (response.status === 401) return onLogout();
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [queryString]);

  function startNewProject() {
    setEditing({
      name: '',
      slug: '',
      description: '',
      locations: 'Kadiri\nAnantapur\nOther',
      isActive: true,
      questions: [{ ...blankQuestion, label: 'Sample question', type: 'text', required: true }]
    });
  }

  function editProject(project) {
    setEditing({
      ...project,
      locations: project.locations.join('\n'),
      questions: project.questions.map((question) => ({
        ...question,
        options: (question.options || []).join('\n')
      }))
    });
  }

  async function saveProject(project) {
    setStatus('');
    const method = project.id ? 'PUT' : 'POST';
    const url = project.id ? `${apiBase}/api/projects/${project.id}` : `${apiBase}/api/projects`;
    const response = await fetch(url, {
      method,
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || 'Unable to save project.');
      return;
    }
    setStatus('Project saved.');
    setEditing(null);
    await loadProjects();
    setSelectedId(payload.project.id);
  }

  async function download(type) {
    const response = await fetch(`${apiBase}/api/responses/export.${type}?${queryString}`, { headers: authHeaders });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vtrac-${selectedProject.slug}-responses.${type}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="dashboard">
      <div className="admin-heading">
        <div>
          <h2>Admin Dashboard</h2>
          <p>Create projects, design forms, review data, and download exports.</p>
        </div>
        <button className="secondary" onClick={onLogout}>Logout</button>
      </div>

      <div className="panel project-bar">
        <label>
          Project
          <select value={selectedProject?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <button className="secondary" onClick={() => selectedProject && editProject(selectedProject)}>Edit Form</button>
        <button className="primary" onClick={startNewProject}><Plus size={18} /> New Project</button>
        {selectedProject && <span className="public-link">{window.location.origin}{selectedProject.publicUrl}</span>}
      </div>

      {editing && (
        <ProjectEditor
          project={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={saveProject}
        />
      )}

      <div className="panel filters">
        <label>
          <Search size={16} />
          <input placeholder="Search name, location, household" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        </label>
        <input placeholder="Enumerator" value={filters.enumerator} onChange={(event) => setFilters({ ...filters, enumerator: event.target.value })} />
        <input placeholder="Location" value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })} />
        <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
        <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
        <button className="icon-button" onClick={loadDashboard} aria-label="Refresh dashboard"><RefreshCw size={18} /></button>
        <button className="download" onClick={() => download('csv')}><Download size={16} /> CSV</button>
        <button className="download" onClick={() => download('xlsx')}><Download size={16} /> Excel</button>
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

      <RecentTable rows={data?.recent || []} loading={loading} />
      {status && <p className="status">{status}</p>}
    </section>
  );
}

function ProjectEditor({ project, onChange, onCancel, onSave }) {
  function update(field, value) {
    onChange({ ...project, [field]: value });
  }

  function updateQuestion(index, field, value) {
    const questions = [...project.questions];
    questions[index] = { ...questions[index], [field]: value };
    onChange({ ...project, questions });
  }

  function addQuestion() {
    onChange({ ...project, questions: [...project.questions, { ...blankQuestion }] });
  }

  function removeQuestion(index) {
    onChange({ ...project, questions: project.questions.filter((_, currentIndex) => currentIndex !== index) });
  }

  return (
    <div className="panel editor-panel">
      <div className="section-title">
        <h2>{project.id ? 'Edit Project Form' : 'New Project Form'}</h2>
        <div className="actions">
          <button className="secondary" onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={() => onSave(project)}><Save size={18} /> Save</button>
        </div>
      </div>

      <div className="inline-grid">
        <label>
          Project name
          <input value={project.name} onChange={(event) => update('name', event.target.value)} />
        </label>
        <label>
          URL slug
          <input value={project.slug} onChange={(event) => update('slug', event.target.value)} placeholder="example-survey" />
        </label>
      </div>
      <label>
        Description
        <textarea value={project.description} onChange={(event) => update('description', event.target.value)} />
      </label>
      <label>
        Locations
        <textarea value={project.locations} onChange={(event) => update('locations', event.target.value)} />
      </label>

      <div className="question-list">
        {project.questions.map((question, index) => (
          <div className="question-card" key={index}>
            <div className="question-header">
              <strong>Question {index + 1}</strong>
              <button className="icon-button" onClick={() => removeQuestion(index)} aria-label="Remove question"><Trash2 size={16} /></button>
            </div>
            <div className="inline-grid">
              <label>
                Label
                <input value={question.label} onChange={(event) => updateQuestion(index, 'label', event.target.value)} />
              </label>
              <label>
                Type
                <select value={question.type} onChange={(event) => updateQuestion(index, 'type', event.target.value)}>
                  <option value="text">Text</option>
                  <option value="textarea">Long text</option>
                  <option value="select">Dropdown</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
              </label>
            </div>
            {question.type === 'select' && (
              <label>
                Options
                <textarea value={question.options} onChange={(event) => updateQuestion(index, 'options', event.target.value)} />
              </label>
            )}
            <label className="check-row">
              <input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, 'required', event.target.checked)} />
              Required
            </label>
          </div>
        ))}
      </div>

      <button className="secondary" onClick={addQuestion}><Plus size={18} /> Add Question</button>
    </div>
  );
}

function RecentTable({ rows, loading }) {
  return (
    <div className="panel table-panel">
      <div className="section-title">
        <h2>Recent Submissions</h2>
        <p>{loading ? 'Refreshing...' : `${rows.length} shown`}</p>
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
            {rows.map((row) => (
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
