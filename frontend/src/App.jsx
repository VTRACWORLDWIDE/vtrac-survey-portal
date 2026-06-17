import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Link2,
  LocateFixed,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound
} from 'lucide-react';

const apiBase = import.meta.env.VITE_API_BASE || '';
const blankQuestion = { id: '', label: '', type: 'text', options: '', required: false };
const airportPrefix = 'Kempegowda International Airport - ';
const hiddenQuestionIds = new Set([
  'google_coordinates',
  'origin_zone_number',
  'origin_mapped_area',
  'origin_division',
  'travel_time_total_minutes',
  'travel_time_expected_range',
  'travel_time_validation'
]);
const originRows = [
  [1, 'CBD (MG Road / Brigade Road/surrounding areas)', 'Central Bangalore'],
  [2, 'Shivajinagar, Frazer town, Cox town', 'Central Bangalore'],
  [3, 'Vasanth Nagar', 'Central Bangalore'],
  [4, 'Richmond Town/Residency Road/ Santhinagar /Wilson Garden', 'Central Bangalore'],
  [5, 'Majestic, Gandhinagar, Chickpet', 'Central Bangalore'],
  [6, 'Hebbal, RT Nagar, Sanjaynagar', 'North Bangalore'],
  [7, 'Yelahanka, Sahakar Nagar,Vidyaranyapura', 'North Bangalore'],
  [8, 'Jakkur', 'North Bangalore'],
  [9, 'Thanisandra, Hennur, Nagawara, HBR Layout', 'North Bangalore'],
  [10, 'Banaswadi, Horamavu', 'North Bangalore'],
  [11, 'Bagaluru,Satnur, Budigere', 'North Bangalore'],
  [12, 'Devanahalli', 'North Bangalore'],
  [13, 'Doddaballapur', 'North Bangalore'],
  [14, 'Indiranagar', 'East Bangalore'],
  [15, 'CV Raman Nagar', 'East Bangalore'],
  [16, 'KR Puram', 'East Bangalore'],
  [17, 'Whitefield', 'East Bangalore'],
  [18, 'Marathahalli', 'East Bangalore'],
  [19, 'Mahadevapura', 'East Bangalore'],
  [20, 'Hoodi', 'East Bangalore'],
  [21, 'Varthur', 'East Bangalore'],
  [22, 'Sarjapura', 'East Bangalore'],
  [23, 'Hosakote', 'East Bangalore'],
  [24, 'Jayanagar, Basavanagudi, Mavalli, Lalbagh', 'South Bangalore'],
  [25, 'JP Nagar', 'South Bangalore'],
  [26, 'Banashankari', 'South Bangalore'],
  [27, 'Adugodi, Koramangala, BTM Layout, HSR Layout,Bommanahalli', 'South Bangalore'],
  [28, 'Electronic City, Bommasandra, Madivala', 'South Bangalore'],
  [29, 'Bannerghatta', 'South Bangalore'],
  [30, 'Anekal', 'South Bangalore'],
  [31, 'Uttarahalli', 'South Bangalore'],
  [32, 'Begur, Kothnur, Arekere', 'South Bangalore'],
  [33, 'Rajajinagar, Nagarbhaavi, Vijayanagar, Ullal', 'West Bangalore'],
  [34, 'Malleshwaram', 'West Bangalore'],
  [35, 'Yeshwanthpur', 'West Bangalore'],
  [36, 'Peenya', 'West Bangalore'],
  [37, 'Nelamangala', 'West Bangalore'],
  [38, 'Kengeri', 'West Bangalore'],
  [39, 'Ramanagara, Mandya, Mysore, Kodagu,Chamarajanagar, Hasan', 'Other districts of Karnataka'],
  [40, 'Tumkur', 'Other districts of Karnataka'],
  [41, 'Chikkballapura', 'Other districts of Karnataka'],
  [42, 'Kolar', 'Other districts of Karnataka'],
  [43, 'Chitradurga,Davanagere, Chikmagluru, Shivamogga', 'Other districts of Karnataka'],
  [44, 'Uduppi, Dekshin kannada, Shimoga, Uttara Kannada', 'Other districts of Karnataka'],
  [45, 'Vijayanagara, Belagavi, Haveri, Hubli, Dharwad, Gadag, Vijayapura, Bagalkot, Ballari, Koppal, Kalaburgi, Yadgir,Raichur, Bidar', 'Other districts of Karnataka'],
  [46, 'Hosur, Tamil Nadu', 'Other States'],
  [47, 'Andhra Pradesh', 'Other States'],
  [48, 'Telangana', 'Other States']
];
const extraOriginAliases = {
  'MG Road': 'CBD (MG Road / Brigade Road/surrounding areas)',
  'Brigade Road': 'CBD (MG Road / Brigade Road/surrounding areas)',
  'CBD': 'CBD (MG Road / Brigade Road/surrounding areas)',
  'Richmond Town': 'Richmond Town/Residency Road/ Santhinagar /Wilson Garden',
  'Residency Road': 'Richmond Town/Residency Road/ Santhinagar /Wilson Garden',
  'Santhinagar': 'Richmond Town/Residency Road/ Santhinagar /Wilson Garden',
  'Wilson Garden': 'Richmond Town/Residency Road/ Santhinagar /Wilson Garden',
  'BTM Layout': 'Adugodi, Koramangala, BTM Layout, HSR Layout,Bommanahalli',
  'HSR Layout': 'Adugodi, Koramangala, BTM Layout, HSR Layout,Bommanahalli',
  'Chikkamagaluru': 'Chitradurga,Davanagere, Chikmagluru, Shivamogga',
  'Dakshina Kannada': 'Uduppi, Dekshin kannada, Shimoga, Uttara Kannada'
};
const originLocalityMap = Object.fromEntries([
  ...originRows.flatMap(([zoneNumber, area, division]) => {
    const aliases = area.split(',').map((item) => item.trim()).filter(Boolean);
    return [area, ...aliases].map((alias) => [alias, { zoneNumber, area, division }]);
  }),
  ...Object.entries(extraOriginAliases).map(([alias, area]) => {
    const row = originRows.find(([, rowArea]) => rowArea === area);
    return [alias, { zoneNumber: row[0], area: row[1], division: row[2] }];
  })
]);
const defaultTimeRange = { min: 20, max: 150 };
const travelTimeRanges = {
  'CBD (MG Road / Brigade Road/surrounding areas)': { min: 45, max: 90 },
  'Shivajinagar, Frazer town, Cox town': { min: 40, max: 80 },
  'Vasanth Nagar': { min: 35, max: 75 },
  'Richmond Town/Residency Road/ Santhinagar /Wilson Garden': { min: 50, max: 95 },
  'Majestic, Gandhinagar, Chickpet': { min: 45, max: 90 },
  'Hebbal, RT Nagar, Sanjaynagar': { min: 25, max: 55 },
  'Yelahanka, Sahakar Nagar,Vidyaranyapura': { min: 25, max: 55 },
  'Jakkur': { min: 25, max: 50 },
  'Thanisandra, Hennur, Nagawara, HBR Layout': { min: 30, max: 65 },
  'Banaswadi, Horamavu': { min: 35, max: 75 },
  'Bagaluru,Satnur, Budigere': { min: 15, max: 45 },
  'Devanahalli': { min: 10, max: 35 },
  'Doddaballapur': { min: 30, max: 65 },
  'Indiranagar': { min: 45, max: 90 },
  'CV Raman Nagar': { min: 45, max: 90 },
  'KR Puram': { min: 50, max: 100 },
  'Whitefield': { min: 60, max: 120 },
  'Marathahalli': { min: 55, max: 110 },
  'Mahadevapura': { min: 55, max: 110 },
  'Hoodi': { min: 60, max: 120 },
  'Varthur': { min: 70, max: 135 },
  'Sarjapura': { min: 75, max: 150 },
  'Hosakote': { min: 45, max: 90 },
  'Jayanagar, Basavanagudi, Mavalli, Lalbagh': { min: 60, max: 115 },
  'JP Nagar': { min: 65, max: 125 },
  'Banashankari': { min: 70, max: 135 },
  'Adugodi, Koramangala, BTM Layout, HSR Layout,Bommanahalli': { min: 60, max: 125 },
  'Electronic City, Bommasandra, Madivala': { min: 75, max: 150 },
  'Bannerghatta': { min: 80, max: 155 },
  'Anekal': { min: 90, max: 180 },
  'Uttarahalli': { min: 75, max: 145 },
  'Begur, Kothnur, Arekere': { min: 75, max: 145 },
  'Rajajinagar, Nagarbhaavi, Vijayanagar, Ullal': { min: 55, max: 110 },
  'Malleshwaram': { min: 45, max: 90 },
  'Yeshwanthpur': { min: 40, max: 85 },
  'Peenya': { min: 45, max: 95 },
  'Nelamangala': { min: 45, max: 90 },
  'Kengeri': { min: 75, max: 145 }
};

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
        <div className="brand-block">
          <img className="brand-logo" src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
          <div>
            <p className="brand-name">VTRAC</p>
            <h1>Survey Portal</h1>
          </div>
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
        if (payload.questions?.some((question) => question.id === 'google_coordinates')) {
          captureGps(payload.questions);
        }
      })
      .catch(() => setStatus('Unable to load survey questions.'));
  }, [projectSlug]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAnswer(questionId, value) {
    const originMapping = questionId === 'origin_locality' ? originLocalityMap[value] : null;
    setForm((current) => ({
      ...current,
      answers: deriveAnswers({
        ...current.answers,
        [questionId]: value,
        ...(originMapping ? {
          origin_zone_number: String(originMapping.zoneNumber),
          origin_mapped_area: originMapping.area,
          origin_division: originMapping.division
        } : {})
      })
    }));
  }

  function captureGps(questions = config.questions || []) {
    if (!navigator.geolocation) {
      setGpsStatus('GPS is not supported on this device.');
      return;
    }
    setGpsStatus('Capturing...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextGps = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setGps(nextGps);
        if (questions.some((question) => question.id === 'google_coordinates')) {
          updateAnswer('google_coordinates', `${nextGps.latitude.toFixed(6)}, ${nextGps.longitude.toFixed(6)}`);
        }
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
    <section className="survey-shell">
      <div className="survey-hero">
        <div>
          <p className="eyebrow">Field Collection</p>
          <h2>{config.name || 'Survey'}</h2>
          <p>{config.description || 'Submit accurate field data from any mobile browser.'}</p>
        </div>
        <div className="hero-pill">
          <CalendarClock size={18} />
          {new Date().toLocaleDateString()}
        </div>
      </div>

      <div className="page-grid">
        <form className="panel form-panel" onSubmit={submit}>
          <div className="section-title">
            <div>
              <h2>Response Details</h2>
              <p>{new Date().toLocaleString()}</p>
            </div>
          </div>

          <div className="form-section">
            <div className="section-kicker"><UserRound size={16} /> Enumerator</div>
            <label>
              Enumerator name
              <input value={form.enumeratorName} onChange={(event) => update('enumeratorName', event.target.value)} required />
            </label>
            <SurveyLocationInput
              locations={config.locations || []}
              value={form.location}
              onChange={(value) => update('location', value)}
            />
          </div>

          <div className="form-section">
            <div className="section-kicker"><FileText size={16} /> Respondent</div>
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
          </div>

          <div className="gps-row">
            <div>
              <strong>GPS location</strong>
              <span>{gpsStatus}</span>
            </div>
            <button type="button" className="icon-button" onClick={captureGps} aria-label="Capture GPS">
              <LocateFixed size={18} />
            </button>
          </div>

          <div className="form-section">
            <div className="section-kicker"><ClipboardList size={16} /> Questions</div>
            {(config.questions || []).filter((question) => !hiddenQuestionIds.has(question.id)).map((question, index) => (
              <QuestionInput
                key={question.id}
                question={question}
                index={index}
                value={form.answers[question.id] || ''}
                onChange={(value) => updateAnswer(question.id, value)}
              />
            ))}
          </div>

          <button className="primary submit-button" disabled={saving}>
            <Send size={18} />
            {saving ? 'Submitting...' : 'Submit Survey'}
          </button>
          {status && <p className={status.includes('successfully') ? 'status success' : 'status'}>{status}</p>}
        </form>

        <aside className="side-stack">
          <div className="panel quiet-panel">
            <h2>Collection Status</h2>
            <div className="info-list">
              <span><ShieldCheck size={17} /> Public field link</span>
              <span><MapPin size={17} /> {config.locations?.length || 0} locations</span>
              <span><ClipboardList size={17} /> {config.questions?.length || 0} questions</span>
            </div>
          </div>
          <div className="panel accent-panel">
            <CheckCircle2 size={22} />
            <strong>Ready for pilot collection</strong>
            <p>Responses are saved immediately and available in the admin dashboard.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function deriveAnswers(answers) {
  const hoursValue = answers.time_taken_to_reach_airport_hours ?? answers.travel_time_hours;
  const minutesValue = answers.time_taken_to_reach_airport_minutes ?? answers.travel_time_minutes;
  const hours = Number(hoursValue || 0);
  const minutes = Number(minutesValue || 0);
  const hasDuration = hoursValue !== undefined || minutesValue !== undefined;
  const total = Math.max(0, (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0));
  const area = answers.origin_mapped_area;
  const range = travelTimeRanges[area] || defaultTimeRange;
  const validation = !hasDuration || total === 0
    ? ''
    : total < range.min
      ? 'Too low - verify with respondent'
      : total > range.max
        ? 'Too high - verify with respondent'
        : 'OK';

  return {
    ...answers,
    ...(hasDuration ? {
      travel_time_total_minutes: String(total),
      travel_time_expected_range: `${range.min}-${range.max} minutes`,
      travel_time_validation: validation
    } : {})
  };
}

function SurveyLocationInput({ locations, value, onChange }) {
  const airportLocations = locations
    .filter((location) => location.startsWith(airportPrefix))
    .map((location) => {
      const [, terminal, point] = location.match(/Terminal ([12]) - (.+)$/) || [];
      return { location, terminal: terminal ? `Terminal ${terminal}` : '', point: point || '' };
    })
    .filter((item) => item.terminal && item.point);

  if (airportLocations.length === 0) {
    return (
      <label>
        Survey location
        <select value={value} onChange={(event) => onChange(event.target.value)} required>
          <option value="">Select location</option>
          {locations.map((location) => <option key={location}>{location}</option>)}
        </select>
      </label>
    );
  }

  const selected = airportLocations.find((item) => item.location === value);
  const terminals = [...new Set(airportLocations.map((item) => item.terminal))];
  const terminal = selected?.terminal || '';
  const points = airportLocations.filter((item) => item.terminal === terminal);

  return (
    <div className="inline-grid">
      <label>
        Airport terminal
        <select
          value={terminal}
          onChange={(event) => {
            const next = airportLocations.find((item) => item.terminal === event.target.value);
            onChange(next?.location || '');
          }}
          required
        >
          <option value="">Select terminal</option>
          {terminals.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        Survey point
        <select
          value={selected?.point || ''}
          onChange={(event) => {
            const next = airportLocations.find((item) => item.terminal === terminal && item.point === event.target.value);
            onChange(next?.location || '');
          }}
          required
          disabled={!terminal}
        >
          <option value="">Select point</option>
          {points.map((item) => <option key={item.location}>{item.point}</option>)}
        </select>
      </label>
    </div>
  );
}

function QuestionInput({ question, index, value, onChange }) {
  const numberProps = question.id.includes('minutes')
    ? { min: 0, max: 59, inputMode: 'numeric' }
    : question.id.includes('hours')
      ? { min: 0, max: 12, inputMode: 'numeric' }
      : {};

  return (
    <div className="question-field">
      <label>
        <span>{index + 1}. {question.label}{question.required && <b>Required</b>}</span>
        {question.type === 'textarea' && (
          <textarea value={value} onChange={(event) => onChange(event.target.value)} required={question.required} />
        )}
        {question.type === 'select' && question.options.length > 8 && (
          <SearchableSelect
            options={question.options}
            value={value}
            onChange={onChange}
            required={question.required}
          />
        )}
        {question.type === 'select' && question.options.length <= 8 && (
          <select value={value} onChange={(event) => onChange(event.target.value)} required={question.required}>
            <option value="">Select answer</option>
            {question.options.map((option) => <option key={option}>{option}</option>)}
          </select>
        )}
        {question.type === 'number' && (
          <input type="number" value={value} onChange={(event) => onChange(event.target.value)} required={question.required} {...numberProps} />
        )}
        {question.type === 'date' && (
          <input type="date" value={value} onChange={(event) => onChange(event.target.value)} required={question.required} />
        )}
        {question.type === 'text' && (
          <input value={value} onChange={(event) => onChange(event.target.value)} required={question.required} />
        )}
      </label>
    </div>
  );
}

function SearchableSelect({ options, value, onChange, required }) {
  const [open, setOpen] = useState(false);
  const query = value.toLowerCase();
  const matches = options
    .filter((option) => option.toLowerCase().includes(query))
    .slice(0, 8);

  return (
    <div className="search-select">
      <input
        value={value}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search and select"
        required={required}
      />
      {open && matches.length > 0 && (
        <div className="search-menu">
          {matches.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
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
        <div className="login-mark"><ShieldCheck size={24} /></div>
        <div>
          <p className="eyebrow">VTRAC Admin</p>
          <h2>Sign in to manage surveys</h2>
        </div>
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
          <p className="eyebrow">Operations</p>
          <h2>Admin Dashboard</h2>
          <p>{selectedProject ? selectedProject.name : 'Survey operations'}</p>
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
        <button className="secondary" onClick={() => selectedProject && editProject(selectedProject)}><FileText size={18} /> Edit Form</button>
        <button className="primary" onClick={startNewProject}><Plus size={18} /> New Project</button>
        {selectedProject && <span className="public-link"><Link2 size={16} /> {window.location.origin}{selectedProject.publicUrl}</span>}
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
        <Metric icon={<ClipboardList size={19} />} label="Total samples" value={data?.totals?.total_samples ?? 0} />
        <Metric icon={<CalendarClock size={19} />} label="Samples today" value={data?.totals?.samples_today ?? 0} />
        <Metric icon={<UserRound size={19} />} label="Enumerators" value={data?.byEnumerator?.length ?? 0} />
        <Metric icon={<MapPin size={19} />} label="Locations" value={data?.byLocation?.length ?? 0} />
      </div>

      <div className="chart-grid">
        <Breakdown title="Samples by date" rows={data?.byDate || []} labelKey="date" valueKey="samples" />
        <Breakdown title="Samples by enumerator" rows={data?.byEnumerator || []} labelKey="enumerator_name" valueKey="samples" />
        <Breakdown title="Samples by location" rows={data?.byLocation || []} labelKey="location" valueKey="samples" />
      </div>

      <RecentTable rows={data?.recent || []} loading={loading} />
      {status && <p className="status success">{status}</p>}
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
    <div className="editor-panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">Form Designer</p>
          <h2>{project.id ? 'Edit Project Form' : 'New Project Form'}</h2>
        </div>
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
              <strong><ClipboardList size={16} /> Question {index + 1}</strong>
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

      <button className="secondary add-question" onClick={addQuestion}><Plus size={18} /> Add Question</button>
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

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      <span>{icon}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Breakdown({ title, rows, labelKey, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey])), 1);
  return (
    <div className="panel breakdown">
      <h2><BarChart3 size={17} /> {title}</h2>
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
