import { Component, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Link2,
  LogOut,
  Maximize2,
  MapPin,
  Pencil,
  Plus,
  Settings,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Share2,
  Table2,
  Trash2,
  Upload,
  UserRound,
  UserSearch,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  TrendingUp
} from 'lucide-react';

const apiBase = import.meta.env.VITE_API_BASE || '';
const blankQuestion = { id: '', label: '', type: 'text', options: '', required: false };
const airportPrefix = 'Kempegowda International Airport - ';
const defaultProjectSlug = 'bengaluru-second-airport-feasibility';
const exportTypes = [
  { value: 'xlsx', label: 'Excel workbook (.xlsx)' },
  { value: 'csv', label: 'CSV' },
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'kml', label: 'GPS coordinates (KML)' }
];
const exportHistory = [
  { value: 'xlsx', label: 'XLSX', format: 'Labels', groups: 'Departures + Arrivals tabs' },
  { value: 'csv', label: 'CSV', format: 'Labels', groups: 'All filtered responses' },
  { value: 'geojson', label: 'GeoJSON', format: 'GPS points', groups: 'Map-ready coordinates' },
  { value: 'kml', label: 'KML', format: 'GPS points', groups: 'Google Earth / GIS' }
];
const mapBaseLayers = {
  osm: {
    label: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  },
  topo: {
    label: 'OpenTopoMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap',
    maxZoom: 17
  },
  imagery: {
    label: 'ESRI World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19
  },
  humanitarian: {
    label: 'Humanitarian',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, HOT',
    maxZoom: 19
  }
};
const adminSectionPermissions = {
  overview: ['platform.overview.view', 'analytics.view', 'projects.manage'],
  projects: ['projects.manage', 'surveys.design', 'responses.view', 'responses.export', 'analytics.view'],
  projectWorkspace: ['projects.manage', 'surveys.design', 'responses.view', 'responses.edit', 'responses.export', 'quality.manage', 'analytics.view'],
  organisation: ['organisation.manage'],
  users: ['users.manage'],
  clients: ['clients.manage'],
  vendors: ['vendors.manage'],
  library: ['analytics.view', 'responses.export']
};

const legacyRolePermissionMap = {
  admin: ['*'],
  teamLead: ['platform.overview.view', 'responses.view', 'quality.manage'],
  floorManager: ['platform.overview.view', 'projects.manage', 'responses.view', 'responses.export', 'analytics.view'],
  qaQc: ['platform.overview.view', 'responses.view', 'responses.edit', 'quality.manage', 'audit.view']
};

const adminRoleAliases = {
  admin: 'platformSuperAdmin',
  teamLead: 'supervisor',
  floorManager: 'projectManager',
  qaQc: 'qaManager'
};

function normalizeAdminRoleKey(role) {
  const value = String(role || 'analyst').trim();
  return adminRoleAliases[value] || value || 'analyst';
}

function decodeTokenClaims(token) {
  if (!token || !token.includes('.')) return null;
  try {
    const [body] = token.split('.');
    const base64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function rolePermissionsFor(roleKey, roles = []) {
  const normalizedRole = normalizeAdminRoleKey(roleKey);
  if (normalizedRole === 'platformSuperAdmin' || roleKey === 'admin') return new Set(['*']);
  const role = roles.find((item) => item.key === normalizedRole || item.key === roleKey);
  return new Set(role?.permissions || legacyRolePermissionMap[roleKey] || []);
}

function hasPermissionInSet(permissions, permission) {
  return permissions.has('*') || permissions.has(permission);
}

function canAccessSection(section, permissions) {
  const requiredPermissions = adminSectionPermissions[section] || [];
  return requiredPermissions.length === 0 || requiredPermissions.some((permission) => hasPermissionInSet(permissions, permission));
}

function displayRoleName(roleKey, roles = []) {
  const normalizedRole = normalizeAdminRoleKey(roleKey);
  const role = roles.find((item) => item.key === normalizedRole || item.key === roleKey);
  if (role) return role.name;
  if (normalizedRole === 'platformSuperAdmin') return 'Platform Super Admin';
  return roleDisplayName(roleKey, roles);
}

function parseBulkUserRows(text, defaultRole = 'analyst') {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const cells = line.includes('\t') ? line.split('\t') : line.split(',');
      const [displayName = '', email = '', username = '', role = '', password = ''] = cells.map((cell) => cell.trim());
      const generatedUsername = (username || email.split('@')[0] || displayName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '');
      return {
        displayName: displayName || generatedUsername,
        email,
        username: generatedUsername,
        role: role || defaultRole,
        password,
        isActive: true
      };
    })
    .filter((user) => user.username && user.displayName);
}

const markerPalettes = {
  vtrac: ['#0aa7a4', '#133e98', '#2f80ed', '#7b61ff', '#e0a12f', '#ef476f', '#2fbf71'],
  qualitative: ['#ff8c7a', '#a8f080', '#a678de', '#7ee0a1', '#7a85df', '#f0d36b', '#ea7fce', '#79c7c2'],
  sequential: ['#133e98', '#1d5fbf', '#2f80ed', '#48a4d8', '#77c7c2', '#aae2c1', '#e1f5d8'],
  diverging: ['#2f80ed', '#79c7c2', '#dff3ef', '#fde7dc', '#ff9b79', '#ef476f']
};
const componentModes = ['off', 'optional', 'mandatory'];
const componentModeLabels = {
  off: 'Off',
  optional: 'Optional',
  mandatory: 'Mandatory'
};
const defaultComponentPolicy = {
  airportLocationFlow: 'off',
  gps: 'off',
  audio: 'off',
  respondentPhone: 'optional',
  householdId: 'off'
};
const defaultProjectSettings = {
  componentPolicy: { ...defaultComponentPolicy },
  airportLocationMode: false,
  captureGps: false,
  captureAudio: false,
  showRespondentPhone: true,
  showHouseholdId: false
};

function normalizeComponentMode(value, fallback = 'off') {
  return componentModes.includes(value) ? value : fallback;
}

function normalizeSurveySettings(rawSettings = {}, slug = '') {
  const parsed = typeof rawSettings === 'string' ? safeParseJson(rawSettings, {}) : rawSettings || {};
  const providedPolicy = parsed.componentPolicy || {};
  const componentPolicy = {
    airportLocationFlow: normalizeComponentMode(
      providedPolicy.airportLocationFlow,
      parsed.airportLocationMode === undefined
        ? (slug === defaultProjectSlug ? 'mandatory' : defaultComponentPolicy.airportLocationFlow)
        : (parsed.airportLocationMode ? 'mandatory' : 'off')
    ),
    gps: normalizeComponentMode(providedPolicy.gps, parsed.captureGps ? 'optional' : defaultComponentPolicy.gps),
    audio: normalizeComponentMode(providedPolicy.audio, parsed.captureAudio ? 'optional' : defaultComponentPolicy.audio),
    respondentPhone: normalizeComponentMode(
      providedPolicy.respondentPhone,
      parsed.showRespondentPhone === false ? 'off' : defaultComponentPolicy.respondentPhone
    ),
    householdId: normalizeComponentMode(providedPolicy.householdId, parsed.showHouseholdId ? 'optional' : defaultComponentPolicy.householdId)
  };
  return withComponentPolicy({ ...defaultProjectSettings, ...parsed }, componentPolicy);
}

function withComponentPolicy(settings, componentPolicy) {
  const normalizedPolicy = {
    airportLocationFlow: normalizeComponentMode(componentPolicy.airportLocationFlow, defaultComponentPolicy.airportLocationFlow),
    gps: normalizeComponentMode(componentPolicy.gps, defaultComponentPolicy.gps),
    audio: normalizeComponentMode(componentPolicy.audio, defaultComponentPolicy.audio),
    respondentPhone: normalizeComponentMode(componentPolicy.respondentPhone, defaultComponentPolicy.respondentPhone),
    householdId: normalizeComponentMode(componentPolicy.householdId, defaultComponentPolicy.householdId)
  };
  return {
    ...settings,
    componentPolicy: normalizedPolicy,
    airportLocationMode: normalizedPolicy.airportLocationFlow !== 'off',
    captureGps: normalizedPolicy.gps !== 'off',
    captureAudio: normalizedPolicy.audio !== 'off',
    showRespondentPhone: normalizedPolicy.respondentPhone !== 'off',
    showHouseholdId: normalizedPolicy.householdId !== 'off'
  };
}

function getComponentMode(settings, key) {
  return normalizeComponentMode(settings?.componentPolicy?.[key], defaultComponentPolicy[key] || 'off');
}

function isComponentEnabled(settings, key) {
  return getComponentMode(settings, key) !== 'off';
}

function isComponentMandatory(settings, key) {
  return getComponentMode(settings, key) === 'mandatory';
}

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
const airportTerminals = ['Terminal 1', 'Terminal 2'];
const airportMovements = ['Departures', 'Arrivals'];
const airportSurveyPoints = {
  Departures: ['Departure gates', 'Cab/Taxi points', 'Bus station', 'Other'],
  Arrivals: ['Arrival gate', 'Cab/Taxi points', 'Bus station', 'Other']
};
const hiddenQuestionIds = new Set([
  'google_coordinates',
  'origin_zone_number',
  'origin_mapped_area',
  'origin_division',
  'destination_zone_number',
  'destination_mapped_area',
  'destination_division',
  'travel_time_total_minutes',
  'travel_time_expected_range',
  'travel_time_validation',
  'final_destination_time_total_minutes',
  'final_destination_time_expected_range',
  'final_destination_time_validation'
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

  const isPublicSurvey = route.startsWith('/p/');
  const isResetRoute = route.startsWith('/reset-access');
  const isAdminRoute = route.startsWith('/admin');
  const isClientRoute = route.startsWith('/client') || route === '/';
  const publicSlug = isPublicSurvey ? route.replace('/p/', '') : defaultProjectSlug;

  return (
    <main>
      {!isPublicSurvey && !isResetRoute && !isAdminRoute && !isClientRoute && <header className="topbar">
        <div className="brand-block">
          <img className="brand-logo" src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
          <div>
            <p className="brand-name">VTRAC</p>
            <h1>Survey Portal</h1>
          </div>
        </div>
        {!isPublicSurvey && (
          <nav>
            <button className={route.startsWith('/client') || route === '/' ? 'active' : ''} onClick={() => navigate('/client')}>Client</button>
            <button className={route.startsWith('/admin') ? 'active' : ''} onClick={() => navigate('/admin')}>Admin</button>
          </nav>
        )}
      </header>}
      {isPublicSurvey
        ? <SurveyForm projectSlug={publicSlug} />
        : isResetRoute
        ? <ResetAccessPage />
        : route.startsWith('/admin')
        ? <AdminApp />
        : <ClientApp />}
    </main>
  );
}


function ResetAccessPage() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [account, setAccount] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadToken() {
      if (!token) {
        setStatus('This access link is missing a token.');
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${apiBase}/api/auth/access-token/${encodeURIComponent(token)}`);
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setStatus(payload.error || 'This access link is invalid or expired.');
          setAccount(null);
        } else {
          setAccount(payload);
          setStatus('');
        }
      } catch {
        if (!cancelled) setStatus('Unable to verify this access link right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    setStatus('');
    if (password.length < 8) {
      setStatus('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setStatus('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${apiBase}/api/auth/access-token/${encodeURIComponent(token)}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatus(payload.error || 'Unable to update password.');
        return;
      }
      setStatus(payload.message || 'Password updated. You can now sign in.');
      setTimeout(() => {
        window.history.replaceState({}, '', payload.loginPath || '/client');
        window.location.reload();
      }, 1200);
    } catch {
      setStatus('Unable to update password right now.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-login-screen reset-access-screen">
      <div className="reset-access-card modern-auth-card">
        <div className="admin-login-card-head">
          <div className="admin-login-logo-chip">
            <img src="/vtrac-logo.jpg" alt="VTRAC" />
          </div>
          <div>
            <p className="eyebrow">Secure access</p>
            <h2>Set your VTRAC Survey Portal password</h2>
          </div>
        </div>
        {loading ? (
          <p className="login-support-text">Checking this secure access link...</p>
        ) : account ? (
          <form onSubmit={submit}>
            <p className="login-support-text">
              Account: <strong>{account.displayName || account.username}</strong>
              {account.username ? ` · ${account.username}` : ''}
            </p>
            <label>
              New password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
            </label>
            <label>
              Confirm password
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
            </label>
            <button className="primary" disabled={saving}>{saving ? 'Updating...' : 'Set password'}</button>
          </form>
        ) : (
          <p className="login-support-text">This access link could not be used.</p>
        )}
        {status && <p className={account ? 'status success' : 'status'}>{status}</p>}
      </div>
    </section>
  );
}

function SurveyForm({ projectSlug }) {
  const [config, setConfig] = useState({ locations: [], questions: [] });
  const settings = normalizeSurveySettings(config.settings || {}, projectSlug);
  const gpsEnabled = isComponentEnabled(settings, 'gps');
  const gpsRequired = isComponentMandatory(settings, 'gps');
  const audioEnabled = isComponentEnabled(settings, 'audio');
  const audioRequired = isComponentMandatory(settings, 'audio');
  const phoneEnabled = isComponentEnabled(settings, 'respondentPhone');
  const phoneRequired = isComponentMandatory(settings, 'respondentPhone');
  const householdEnabled = isComponentEnabled(settings, 'householdId');
  const householdRequired = isComponentMandatory(settings, 'householdId');
  const locationFlowEnabled = isComponentEnabled(settings, 'airportLocationFlow');
  const [form, setForm] = useState({
    enumeratorName: '',
    location: '',
    respondentName: '',
    respondentPhone: '',
    householdId: '',
    answers: {}
  });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [enumeratorStats, setEnumeratorStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [audio, setAudio] = useState(null);
  const [audioStatus, setAudioStatus] = useState('No recording');
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioStartAttemptedRef = useRef(false);
  const audioStartPromiseRef = useRef(null);
  const [surveyStartedAt, setSurveyStartedAt] = useState(() => new Date().toISOString());
  const [gpsPosition, setGpsPosition] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('Not captured');
  const gpsAttemptedRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    fetch(`${apiBase}/api/survey-config?project=${encodeURIComponent(projectSlug)}`)
      .then((response) => response.json())
      .then((payload) => {
        setConfig(payload);
        if (!payload.error) saveCachedSurveyConfig(projectSlug, payload);
        if (payload.error) setStatus(payload.error);
      })
      .catch(() => {
        const cachedConfig = loadCachedSurveyConfig(projectSlug);
        if (cachedConfig) {
          setConfig(cachedConfig);
          setStatus('Offline mode: using the last saved questionnaire. Submissions will sync when internet is back.');
          return;
        }
        setStatus('Unable to load survey questions. Open this survey once while online before using it offline.');
      });
  }, [projectSlug]);

  useEffect(() => {
    refreshPendingCount();
    const onOnline = () => {
      setIsOnline(true);
      syncPendingSubmissions();
    };
    const onOffline = () => {
      setIsOnline(false);
      setSyncStatus('Offline. Submissions will be saved in this browser.');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (navigator.onLine) syncPendingSubmissions();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [projectSlug]);

  useEffect(() => {
    const enumeratorName = form.enumeratorName.trim();
    if (enumeratorName.length < 2) {
      setEnumeratorStats(null);
      setStatsLoading(false);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      loadEnumeratorStats(enumeratorName);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [form.enumeratorName, projectSlug]);

  async function loadEnumeratorStats(enumeratorName = form.enumeratorName.trim()) {
    if (!enumeratorName) return;
    setStatsLoading(true);
    try {
      const params = new URLSearchParams({ project: projectSlug, enumerator: enumeratorName });
      const response = await fetch(`${apiBase}/api/public/enumerator-stats?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load enumerator count.');
      setEnumeratorStats(payload);
    } catch {
      setEnumeratorStats(null);
    } finally {
      setStatsLoading(false);
    }
  }

  function activateCaptureModules() {
    if (audioEnabled) beginRequiredAudio();
    if (gpsEnabled) requestGpsCapture();
  }

  function update(field, value) {
    activateCaptureModules();
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAnswer(questionId, value) {
    activateCaptureModules();
    const originMapping = questionId === 'origin_locality' ? originLocalityMap[value] : null;
    const destinationMapping = questionId === 'destination_locality' ? originLocalityMap[value] : null;
    setForm((current) => ({
      ...current,
      answers: deriveAnswers({
        ...current.answers,
        [questionId]: value,
        ...(originMapping ? {
          origin_zone_number: String(originMapping.zoneNumber),
          origin_mapped_area: originMapping.area,
          origin_division: originMapping.division
        } : {}),
        ...(destinationMapping ? {
          destination_zone_number: String(destinationMapping.zoneNumber),
          destination_mapped_area: destinationMapping.area,
          destination_division: destinationMapping.division
        } : {})
      })
    }));
  }

  async function startAudioRecording() {
    if (mediaRecorder || audioRef.current) return true;
    if (audioStartPromiseRef.current) return audioStartPromiseRef.current;
    audioStartAttemptedRef.current = true;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setAudioStatus('Audio recording is not supported on this browser.');
      return false;
    }
    audioStartPromiseRef.current = (async () => {
      try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: getAudioStreamConstraints() });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      let recorder;
      try {
        recorder = new MediaRecorder(stream, getAudioRecorderOptions());
      } catch {
        recorder = new MediaRecorder(stream);
      }
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const recordedMimeType = getRecordingMimeType(recorder, chunks);
        const blob = new Blob(chunks, { type: recordedMimeType });
        const nextAudio = {
          dataUrl: ensureAudioDataUrl(await blobToDataUrl(blob), recordedMimeType),
          mimeType: recordedMimeType,
          size: blob.size
        };
        audioRef.current = nextAudio;
        setAudio(nextAudio);
        setAudioStatus(`Recorded ${formatBytes(blob.size)}`);
        mediaRecorderRef.current = null;
        setMediaRecorder(null);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setMediaRecorder(recorder);
      audioRef.current = null;
      setAudio(null);
      setAudioStatus('Recording...');
      return true;
      } catch {
        setAudioStatus('Microphone permission required.');
        return false;
      } finally {
        audioStartPromiseRef.current = null;
      }
    })();
    return audioStartPromiseRef.current;
  }

  function beginRequiredAudio() {
    if (!audioStartAttemptedRef.current && !audioRef.current && !mediaRecorder) {
      startAudioRecording();
    }
  }

  function requestGpsCapture() {
    if (!gpsEnabled || gpsAttemptedRef.current || gpsPosition) return;
    gpsAttemptedRef.current = true;
    if (!navigator.geolocation) {
      setGpsStatus('GPS is not supported on this browser.');
      return;
    }
    setGpsStatus('Capturing GPS...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          gpsAccuracy: position.coords.accuracy
        };
        setGpsPosition(nextPosition);
        setGpsStatus(`Captured ${nextPosition.latitude.toFixed(6)}, ${nextPosition.longitude.toFixed(6)}`);
      },
      () => {
        setGpsStatus('GPS not available. Submit will continue without GPS.');
      },
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 }
    );
  }

  function finalizeAudioRecording() {
    const activeRecorder = mediaRecorderRef.current || mediaRecorder;
    if (!activeRecorder || activeRecorder.state !== 'recording') return Promise.resolve(audioRef.current || audio);
    setAudioStatus('Stopping recording...');
    return new Promise((resolve) => {
      const recorder = activeRecorder;
      const previousStop = recorder.onstop;
      recorder.onstop = async (event) => {
        if (previousStop) await previousStop(event);
        resolve(audioRef.current);
      };
      recorder.stop();
    });
  }

  function clearAudio() {
    audioRef.current = null;
    mediaRecorderRef.current = null;
    audioStartAttemptedRef.current = false;
    audioStartPromiseRef.current = null;
    setAudio(null);
    setAudioStatus('No recording');
  }

  function resetAfterSubmit() {
    setSurveyStartedAt(new Date().toISOString());
    gpsAttemptedRef.current = false;
    setGpsPosition(null);
    setGpsStatus('Not captured');
    setForm({
      enumeratorName: form.enumeratorName,
      location: form.location,
      respondentName: '',
      respondentPhone: '',
      householdId: '',
      answers: {}
    });
    clearAudio();
  }

  async function sendSubmission(payload) {
    const response = await fetch(`${apiBase}/api/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const rawResult = await response.text();
    let result = {};
    try {
      result = rawResult ? JSON.parse(rawResult) : {};
    } catch {
      result = {};
    }
    if (!response.ok) {
      const fallbackMessage = response.status === 413
        ? 'Recording is too large for upload. Please refresh and submit again.'
        : `Unable to submit survey. Server returned ${response.status}.`;
      const error = new Error(result.error || fallbackMessage);
      error.fromServer = true;
      throw error;
    }
    return result;
  }

  async function refreshPendingCount() {
    try {
      const queued = await getQueuedSubmissions(projectSlug);
      setPendingCount(queued.length);
    } catch {
      setPendingCount(0);
      setSyncStatus('Offline queue is not supported on this browser.');
    }
  }

  async function syncPendingSubmissions() {
    let queued = [];
    try {
      queued = await getQueuedSubmissions(projectSlug);
    } catch {
      setSyncStatus('Offline queue is not supported on this browser.');
      return;
    }
    if (queued.length === 0) {
      setPendingCount(0);
      return;
    }
    setSyncStatus(`Syncing ${queued.length} pending...`);
    let synced = 0;
    for (const item of queued) {
      try {
        await sendSubmission(item.payload);
        await deleteQueuedSubmission(item.id);
        synced += 1;
      } catch (error) {
        if (error.fromServer) {
          setSyncStatus(`Pending item needs review: ${error.message}`);
        } else {
          setSyncStatus('Offline. Pending submissions will sync automatically.');
        }
        break;
      }
    }
    await refreshPendingCount();
    if (synced > 0) {
      setSyncStatus(`Synced ${synced} pending submission${synced === 1 ? '' : 's'}.`);
      loadEnumeratorStats(form.enumeratorName.trim());
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus('');
    const surveyEndedAt = new Date().toISOString();
    const surveyDurationSeconds = Math.max(0, Math.round((new Date(surveyEndedAt).getTime() - new Date(surveyStartedAt).getTime()) / 1000));
    let finalAudio = audioRef.current || audio;
    if (audioEnabled) {
      finalAudio = await finalizeAudioRecording();
    }
    const hasGps = Number.isFinite(Number(gpsPosition?.latitude)) && Number.isFinite(Number(gpsPosition?.longitude));
    if (gpsRequired && !hasGps) {
      requestGpsCapture();
      setStatus('GPS coordinates are mandatory for this project. Please allow location permission and submit again.');
      setSaving(false);
      return;
    }
    if (audioRequired && !finalAudio) {
      setStatus('Audio recording is mandatory for this project. Please allow microphone access and submit again.');
      setSaving(false);
      return;
    }
    const submissionPayload = {
      ...form,
      projectSlug,
      ...gpsPosition,
      audio: audioEnabled ? finalAudio : null,
      surveyStartedAt,
      surveyEndedAt,
      surveyDurationSeconds,
      clientSubmissionId: createLocalSubmissionId()
    };
    try {
      const payload = await sendSubmission(submissionPayload);
      setStatus(`Submitted successfully. Response ID: ${payload.response.id}`);
      loadEnumeratorStats(form.enumeratorName.trim());
      resetAfterSubmit();
    } catch (error) {
      if (error.fromServer) {
        setStatus(error.message);
      } else {
        try {
          await queueSubmission({
            id: submissionPayload.clientSubmissionId,
            projectSlug,
            createdAt: new Date().toISOString(),
            payload: submissionPayload
          });
          await refreshPendingCount();
          setStatus('Saved offline. It will auto-sync when internet is back.');
          setSyncStatus('Pending sync saved in this browser.');
          resetAfterSubmit();
        } catch {
          setStatus('Unable to submit or save offline on this browser.');
        }
      }
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
              airportMode={locationFlowEnabled}
            />
          </div>

          <div className="form-section">
            <div className="section-kicker"><FileText size={16} /> Respondent</div>
            <div className="inline-grid">
              <label>
                Respondent name
                <input value={form.respondentName} onChange={(event) => update('respondentName', event.target.value)} />
              </label>
              {phoneEnabled && (
                <label>
                  Phone {phoneRequired && <span className="required-note">Required</span>}
                  <input inputMode="tel" value={form.respondentPhone} onChange={(event) => update('respondentPhone', event.target.value)} required={phoneRequired} />
                </label>
              )}
              {householdEnabled && (
                <label>
                  Household ID {householdRequired && <span className="required-note">Required</span>}
                  <input value={form.householdId} onChange={(event) => update('householdId', event.target.value)} required={householdRequired} />
                </label>
              )}
            </div>
          </div>

          <div className="form-section">
            <div className="section-kicker"><ClipboardList size={16} /> Questions</div>
            {(config.questions || [])
              .filter((question) => !hiddenQuestionIds.has(question.id))
              .filter((question) => questionAppliesToLocation(question.id, form.location))
              .map((question, index) => (
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
          <div className="panel enumerator-panel">
            <div>
              <p className="eyebrow">Enumerator Sync</p>
              <h2>{form.enumeratorName.trim() || 'Enter your name'}</h2>
              <p>{statsLoading ? 'Checking cloud submissions...' : 'Saved responses in cloud database'}</p>
            </div>
            <div className="enumerator-counts">
              <div>
                <strong>{enumeratorStats?.totalSamples ?? 0}</strong>
                <span>Total</span>
              </div>
              <div>
                <strong>{enumeratorStats?.samplesToday ?? 0}</strong>
                <span>Today</span>
              </div>
            </div>
            {enumeratorStats?.lastSubmittedAt && (
              <small>Last submitted {new Date(enumeratorStats.lastSubmittedAt).toLocaleString()}</small>
            )}
          </div>
          <div className="panel accent-panel">
            <CheckCircle2 size={22} />
            <strong>Ready for pilot collection</strong>
            <p>Responses are saved immediately and available in the admin dashboard.</p>
          </div>
          <div className="panel offline-panel">
            <h2>Offline Sync</h2>
            <div className="enumerator-counts">
              <div>
                <strong>{pendingCount}</strong>
                <span>Pending</span>
              </div>
              <div>
                <strong>{isOnline ? 'On' : 'Off'}</strong>
                <span>Internet</span>
              </div>
            </div>
            <p>{syncStatus || 'Pending responses sync automatically when online.'}</p>
            <button className="secondary" onClick={syncPendingSubmissions} type="button"><RefreshCw size={18} /> Sync now</button>
          </div>
          {(gpsEnabled || audioEnabled) && (
            <div className="panel quiet-panel">
              <h2>Capture Modules</h2>
              <div className="info-list">
                {gpsEnabled && <span><MapPin size={17} /> GPS ({componentModeLabels[getComponentMode(settings, 'gps')]}): {gpsStatus}</span>}
                {audioEnabled && <span><ShieldCheck size={17} /> Audio ({componentModeLabels[getComponentMode(settings, 'audio')]}): {audioStatus}</span>}
              </div>
            </div>
          )}
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

  const destinationHoursValue = answers.time_to_reach_final_destination_hours;
  const destinationMinutesValue = answers.time_to_reach_final_destination_minutes;
  const destinationHours = Number(destinationHoursValue || 0);
  const destinationMinutes = Number(destinationMinutesValue || 0);
  const hasDestinationDuration = destinationHoursValue !== undefined || destinationMinutesValue !== undefined;
  const destinationTotal = Math.max(0, (Number.isFinite(destinationHours) ? destinationHours : 0) * 60 + (Number.isFinite(destinationMinutes) ? destinationMinutes : 0));
  const destinationRange = travelTimeRanges[answers.destination_mapped_area] || defaultTimeRange;
  const destinationValidation = !hasDestinationDuration || destinationTotal === 0
    ? ''
    : destinationTotal < destinationRange.min
      ? 'Too low - verify with respondent'
      : destinationTotal > destinationRange.max
        ? 'Too high - verify with respondent'
        : 'OK';

  return {
    ...answers,
    ...(hasDuration ? {
      travel_time_total_minutes: String(total),
      travel_time_expected_range: `${range.min}-${range.max} minutes`,
      travel_time_validation: validation
    } : {}),
    ...(hasDestinationDuration ? {
      final_destination_time_total_minutes: String(destinationTotal),
      final_destination_time_expected_range: `${destinationRange.min}-${destinationRange.max} minutes`,
      final_destination_time_validation: destinationValidation
    } : {})
  };
}

function getAudioStreamConstraints() {
  return {
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 16000 },
    sampleSize: { ideal: 16 },
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };
}

function getRecordingMimeType(recorder, chunks) {
  const candidate = recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || '';
  if (candidate.startsWith('audio/')) return candidate;
  if (candidate.includes('mp4')) return 'audio/mp4';
  if (candidate.includes('webm')) return 'audio/webm';
  if (candidate.includes('ogg')) return 'audio/ogg';
  return 'audio/webm';
}

function ensureAudioDataUrl(dataUrl, mimeType = 'audio/webm') {
  const value = String(dataUrl || '');
  if (value.startsWith('data:audio/')) return value;
  return value.replace(/^data:[^;]*;base64,/, `data:${mimeType};base64,`);
}

function audioExtensionFromMime(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  if (value.includes('mp4') || value.includes('aac')) return 'm4a';
  if (value.includes('ogg')) return 'ogg';
  if (value.includes('wav')) return 'wav';
  return 'webm';
}

function getAudioRecorderOptions() {
  const options = { audioBitsPerSecond: 16000 };
  const supportedTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac'
  ];
  const mimeType = supportedTypes.find((type) => window.MediaRecorder?.isTypeSupported?.(type));
  return mimeType ? { ...options, mimeType } : options;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createLocalSubmissionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function surveyConfigCacheKey(projectSlug) {
  return `vtrac-survey-config:${projectSlug}`;
}

function saveCachedSurveyConfig(projectSlug, config) {
  try {
    localStorage.setItem(surveyConfigCacheKey(projectSlug), JSON.stringify({
      savedAt: new Date().toISOString(),
      config
    }));
  } catch {
    // Local storage can be unavailable in private browsing.
  }
}

function loadCachedSurveyConfig(projectSlug) {
  try {
    const raw = localStorage.getItem(surveyConfigCacheKey(projectSlug));
    if (!raw) return null;
    return JSON.parse(raw)?.config || null;
  } catch {
    return null;
  }
}

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('Offline storage is not supported on this browser.'));
      return;
    }
    const request = window.indexedDB.open('vtrac-survey-offline', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('submissions')) {
        const store = db.createObjectStore('submissions', { keyPath: 'id' });
        store.createIndex('projectSlug', 'projectSlug');
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueSubmission(item) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('submissions', 'readwrite');
    transaction.objectStore('submissions').put(item);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getQueuedSubmissions(projectSlug) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('submissions', 'readonly');
    const request = transaction.objectStore('submissions').getAll();
    request.onsuccess = () => {
      const rows = (request.result || [])
        .filter((item) => item.projectSlug === projectSlug)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      db.close();
      resolve(rows);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function deleteQueuedSubmission(id) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('submissions', 'readwrite');
    transaction.objectStore('submissions').delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function questionAppliesToLocation(questionId, location = '') {
  const isArrival = location.includes(' - Arrivals - ') || location.includes(' - Arrivals');
  const isDeparture = location.includes(' - Departures - ') || location.includes(' - Departures');
  const arrivalQuestionIds = new Set([
    'destination_street_exact_final_place',
    'destination_locality',
    'destination_zone_number',
    'destination_mapped_area',
    'destination_division',
    'coming_from_city_name',
    'arrival_transport_mode_from_airport',
    'time_to_reach_final_destination_hours',
    'time_to_reach_final_destination_minutes',
    'final_destination_time_total_minutes',
    'final_destination_time_expected_range',
    'final_destination_time_validation'
  ]);
  const departureQuestionIds = new Set([
    'origin_street_exact_pickup_place',
    'origin_locality',
    'origin_zone_number',
    'origin_mapped_area',
    'origin_division',
    'travelling_to_city_name',
    'departure_transport_mode_to_airport',
    'time_taken_to_reach_airport_hours',
    'time_taken_to_reach_airport_minutes',
    'travel_time_total_minutes',
    'travel_time_expected_range',
    'travel_time_validation'
  ]);

  if (!isArrival && !isDeparture && (arrivalQuestionIds.has(questionId) || departureQuestionIds.has(questionId))) return false;
  if (isArrival && departureQuestionIds.has(questionId)) return false;
  if (isDeparture && arrivalQuestionIds.has(questionId)) return false;
  return true;
}

function SurveyLocationInput({ locations, value, onChange, airportMode = false }) {
  const [draftTerminal, setDraftTerminal] = useState('');
  const [draftMovement, setDraftMovement] = useState('');
  const [draftPoint, setDraftPoint] = useState('');
  const [otherPoint, setOtherPoint] = useState('');
  const selected = parseAirportLocation(value);
  const usesAirportFlow = airportMode;

  useEffect(() => {
    if (selected) {
      setDraftTerminal(selected.terminal);
      setDraftMovement(selected.movement);
      setDraftPoint(selected.point);
      setOtherPoint(selected.otherText);
    }
  }, [selected?.location]);

  if (!usesAirportFlow) {
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

  const terminal = selected?.terminal || draftTerminal;
  const movement = selected?.movement || draftMovement;
  const point = selected?.point || draftPoint;
  const points = airportSurveyPoints[movement] || [];

  function updateLocation(nextTerminal = terminal, nextMovement = movement, nextPoint = point, nextOther = otherPoint) {
    if (!nextTerminal || !nextMovement || !nextPoint) {
      onChange('');
      return;
    }
    if (nextPoint === 'Other' && !nextOther.trim()) {
      onChange('');
      return;
    }
    const pointLabel = nextPoint === 'Other' ? `Other - ${nextOther.trim()}` : nextPoint;
    onChange(`${airportPrefix}${nextTerminal} - ${nextMovement} - ${pointLabel}`);
  }

  return (
    <div className="location-grid">
      <label>
        Airport terminal
        <select
          value={terminal}
          onChange={(event) => {
            setDraftTerminal(event.target.value);
            setDraftMovement('');
            setDraftPoint('');
            setOtherPoint('');
            onChange('');
          }}
          required
        >
          <option value="">Select terminal</option>
          {airportTerminals.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        Departures / Arrivals
        <select
          value={movement}
          onChange={(event) => {
            const nextMovement = event.target.value;
            setDraftMovement(nextMovement);
            setDraftPoint('');
            setOtherPoint('');
            updateLocation(terminal, nextMovement, '', '');
          }}
          required
          disabled={!terminal}
        >
          <option value="">Select option</option>
          {airportMovements.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        Survey point
        <select
          value={point}
          onChange={(event) => {
            const nextPoint = event.target.value;
            setDraftPoint(nextPoint);
            setOtherPoint('');
            updateLocation(terminal, movement, nextPoint, '');
          }}
          required
          disabled={!terminal || !movement}
        >
          <option value="">Select point</option>
          {points.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      {point === 'Other' && (
        <label className="location-other-field">
          Other survey point
          <input
            value={otherPoint}
            onChange={(event) => {
              const nextOther = event.target.value;
              setOtherPoint(nextOther);
              updateLocation(terminal, movement, 'Other', nextOther);
            }}
            placeholder="Enter exact point"
            required
          />
        </label>
      )}
    </div>
  );
}

function parseAirportLocation(location = '') {
  if (!location.startsWith(airportPrefix)) return null;
  const body = location.slice(airportPrefix.length);
  const [terminal, movement, ...pointParts] = body.split(' - ');
  const rawPoint = pointParts.join(' - ');
  if (!terminal || !movement || !rawPoint) return null;
  const normalizedPoint = normalizeAirportPointLabel(rawPoint);
  const knownPoint = airportSurveyPoints[movement]?.find((item) => item === normalizedPoint);
  if (knownPoint) {
    return { location, terminal, movement, point: knownPoint, otherText: '' };
  }
  if (normalizedPoint.startsWith('Other - ')) {
    return { location, terminal, movement, point: 'Other', otherText: normalizedPoint.replace('Other - ', '') };
  }
  return { location, terminal, movement, point: 'Other', otherText: normalizedPoint };
}

function QuestionInput({ question, index, value, onChange, disabled = false }) {
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
          <textarea value={value} onChange={(event) => onChange(event.target.value)} required={question.required} disabled={disabled} />
        )}
        {question.type === 'select' && question.options.length > 8 && (
          <SearchableSelect
            options={question.options}
            value={value}
            onChange={onChange}
            required={question.required}
            disabled={disabled}
          />
        )}
        {question.type === 'select' && question.options.length <= 8 && (
          <select value={value} onChange={(event) => onChange(event.target.value)} required={question.required} disabled={disabled}>
            <option value="">Select answer</option>
            {question.options.map((option) => <option key={option}>{option}</option>)}
          </select>
        )}
        {question.type === 'number' && (
          <input type="number" value={value} onChange={(event) => onChange(event.target.value)} required={question.required} disabled={disabled} {...numberProps} />
        )}
        {question.type === 'date' && (
          <input type="date" value={value} onChange={(event) => onChange(event.target.value)} required={question.required} disabled={disabled} />
        )}
        {question.type === 'text' && (
          <input value={value} onChange={(event) => onChange(event.target.value)} required={question.required} disabled={disabled} />
        )}
      </label>
    </div>
  );
}

function SearchableSelect({ options, value, onChange, required, disabled = false }) {
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
          if (disabled) return;
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => !disabled && setOpen(true)}
        placeholder="Search and select"
        required={required}
        disabled={disabled}
      />
      {!disabled && open && matches.length > 0 && (
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

function ClientApp() {
  const [token, setToken] = useState(localStorage.getItem('vtracClientToken') || '');

  function handleLogin(nextToken) {
    localStorage.setItem('vtracClientToken', nextToken);
    setToken(nextToken);
  }

  function logout() {
    localStorage.removeItem('vtracClientToken');
    setToken('');
  }

  if (!token) return <ClientLogin onLogin={handleLogin} />;
  return <ClientDashboard token={token} onLogout={logout} />;
}

function ClientLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setStatus('');
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/client/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const payload = await response.json();
      if (!response.ok) return setStatus(payload.error || 'Unable to login.');
      onLogin(payload.token);
    } catch {
      setStatus('Unable to reach the login service. Check deployment and network connectivity.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="client-login-screen">
      <header className="client-login-topbar">
        <div className="client-login-brand">
          <img src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
          <span>VTRAC Client Portal</span>
        </div>
      </header>

      <div className="client-login-layout">
        <div className="client-login-copy">
          <p className="eyebrow">Client Analytics</p>
          <h1>Fieldwork progress, simplified for project review.</h1>
          <p>
            Monitor assigned survey projects with live collection totals, terminal splits,
            movement mix, and location summaries.
          </p>
          <div className="client-login-feature-grid">
            <span><ShieldCheck size={18} /> Project-scoped access</span>
            <span><TrendingUp size={18} /> Live collection trends</span>
            <span><PieChart size={18} /> Terminal and movement mix</span>
          </div>
        </div>

        <form className="client-login-card" onSubmit={submit}>
          <div className="login-mark"><BarChart3 size={24} /></div>
          <div>
            <p className="eyebrow">Secure Client Login</p>
            <h2>View assigned survey dashboards</h2>
          </div>
          <label>
            Username or email
            <input
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setStatus('');
              }}
              required
              autoComplete="username"
              placeholder="client name or email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setStatus('');
              }}
              required
              autoComplete="current-password"
            />
          </label>
          <button className="primary" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
          <AccountRecoveryControls accountType="client" />
          {status && <p className="status">{status}</p>}
        </form>
      </div>
    </section>
  );
}

function AccountRecoveryControls({ accountType }) {
  const [mode, setMode] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const isClient = accountType === 'client';

  function openMode(nextMode) {
    setMode((current) => current === nextMode ? '' : nextMode);
    setStatus('');
  }

  async function submit(event) {
    event.preventDefault();
    setStatus('');
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/auth/recovery-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountType: isClient ? 'client' : 'staff',
          requestType: mode,
          identifier,
          email
        })
      });
      const payload = await response.json();
      setStatus(payload.message || payload.error || 'Recovery request recorded.');
      if (response.ok) {
        setIdentifier('');
        setEmail('');
      }
    } catch {
      setStatus('Unable to record recovery request right now. Please contact the VTRAC admin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-recovery">
      <div className="auth-recovery-actions">
        <button type="button" onClick={() => openMode('username')} className={mode === 'username' ? 'active' : ''}>
          <UserSearch size={15} /> Forgot username
        </button>
        <button type="button" onClick={() => openMode('password')} className={mode === 'password' ? 'active' : ''}>
          <KeyRound size={15} /> Forgot password
        </button>
      </div>
      {mode && (
        <form className="auth-recovery-panel" onSubmit={submit}>
          <p>{mode === 'username' ? 'Enter your email so admin can identify your account.' : 'Enter username or email. Admin will verify and reset access.'}</p>
          <div className="auth-recovery-grid">
            {mode === 'password' && (
              <label>
                Username
                <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="optional" />
              </label>
            )}
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
            </label>
          </div>
          <button type="submit" className="secondary compact-button" disabled={loading || (!identifier.trim() && !email.trim())}>
            <Send size={15} /> {loading ? 'Sending...' : 'Send request'}
          </button>
          {status && <p className="status success">{status}</p>}
        </form>
      )}
    </div>
  );
}

function leadingRow(rows, labelKey) {
  const sorted = [...(rows || [])].sort((left, right) => Number(right.samples || 0) - Number(left.samples || 0));
  const row = sorted[0];
  if (!row) return null;
  return {
    label: formatDashboardLabel(row[labelKey], labelKey),
    samples: Number(row.samples || 0)
  };
}

function formatDashboardLabel(value, labelKey = '') {
  const text = String(value || 'Not specified');
  return labelKey === 'location' ? simplifyAirportLocationLabel(text) : text;
}

function normalizeAirportPointLabel(value) {
  const text = String(value || '').trim();
  if (text === 'Arrival gates') return 'Arrival gate';
  if (text === 'Cab/Taxi point') return 'Cab/Taxi points';
  if (text === 'Bus point') return 'Bus station';
  return text;
}

function simplifyAirportLocationLabel(value) {
  const raw = String(value || '');
  const text = raw.startsWith(airportPrefix) ? raw.slice(airportPrefix.length) : raw;
  const [terminal, movement, ...pointParts] = text.split(' - ');
  if (!terminal || !movement || pointParts.length === 0) return text;
  const point = normalizeAirportPointLabel(pointParts.join(' - '));
  return `${terminal} - ${movement} - ${point}`;
}

function formatDateScope(dateFrom, dateTo) {
  if (dateFrom && dateTo) return `${dateFrom} to ${dateTo}`;
  if (dateFrom) return `From ${dateFrom}`;
  if (dateTo) return `Until ${dateTo}`;
  return 'All dates';
}

function formatProjectDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatProjectDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isArchivedProject(project) {
  return project?.settings?.status === 'archived' || Boolean(project?.settings?.archivedAt);
}

function getProjectStatus(project) {
  if (isArchivedProject(project)) return 'archived';
  return project?.isActive ? 'deployed' : 'draft';
}

function makeSafeFilename(value) {
  return String(value || 'vtrac-graph')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'vtrac-graph';
}

async function exportElementAsImage(element, filename, format = 'png') {
  if (!element) throw new Error('No graph selected for export.');
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    ignoreElements: (node) => node instanceof Element && node.hasAttribute('data-export-ignore'),
    logging: false,
    scale: Math.min(window.devicePixelRatio || 2, 2),
    useCORS: true
  });

  const isJpeg = format === 'jpeg' || format === 'jpg';
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((file) => (file ? resolve(file) : reject(new Error('Unable to create image file.'))), isJpeg ? 'image/jpeg' : 'image/png', 0.92);
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${makeSafeFilename(filename)}.${isJpeg ? 'jpg' : 'png'}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ClientDashboard({ token, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const authHeaders = { Authorization: `Bearer ${token}` };
  const selectedProject = projects.find((project) => String(project.id) === String(selectedId)) || projects[0];
  const totalSamples = Number(data?.totals?.total_samples || 0);
  const todaySamples = Number(data?.totals?.samples_today || 0);
  const terminalRows = data?.byTerminal || [];
  const coveredTerminalRows = terminalRows.filter((row) => ['Terminal 1', 'Terminal 2'].includes(row.terminal));
  const movementRows = data?.byMovement || [];
  const surveyPointRows = data?.bySurveyPoint || [];
  const locationRows = data?.byLocation || [];
  const dateRows = data?.byDate || [];
  const leadingTerminal = leadingRow(coveredTerminalRows, 'terminal');
  const leadingMovement = leadingRow(movementRows, 'movement');
  const leadingPoint = leadingRow(surveyPointRows, 'survey_point');
  const topLocation = leadingRow(locationRows, 'location');
  const latestDate = dateRows[0];
  const activeDays = dateRows.length;
  const averagePerDay = activeDays ? Math.round(totalSamples / activeDays) : 0;
  const dateScope = formatDateScope(filters.dateFrom, filters.dateTo);
  const terminalChartRows = toReportChartRows(coveredTerminalRows.length ? coveredTerminalRows : terminalRows, 'terminal', 'samples', 4);
  const movementChartRows = toReportChartRows(movementRows, 'movement', 'samples', 4);
  const surveyPointChartRows = toReportChartRows(surveyPointRows, 'survey_point', 'samples', 7);
  const locationChartRows = toReportChartRows(locationRows, 'location', 'samples', 8);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedProject?.id) params.set('projectId', selectedProject.id);
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      if (key === 'submittedFrom' || key === 'submittedTo') params.set(key, new Date(value).toISOString());
      else params.set(key, value);
    });
    return params.toString();
  }, [filters, selectedProject?.id]);

  async function loadProjects() {
    try {
      const response = await fetch(`${apiBase}/api/client/projects`, { headers: authHeaders });
      if (response.status === 401) return onLogout();
      const payload = await response.json();
      const nextProjects = payload.projects || [];
      setProjects(nextProjects);
      setSelectedId((current) => current || String(nextProjects?.[0]?.id || ''));
    } finally {
      setProjectsLoaded(true);
    }
  }

  async function loadDashboard() {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/client/dashboard?${queryString}`, { headers: authHeaders });
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

  function clearDateFilters() {
    setFilters({ dateFrom: '', dateTo: '' });
  }

  if (!projectsLoaded) {
    return (
      <section className="client-portal">
        <header className="client-portal-topbar">
          <div className="client-login-brand">
            <img src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
            <span>VTRAC Client Portal</span>
          </div>
          <button className="secondary client-logout-button" onClick={onLogout}><LogOut size={17} /> Logout</button>
        </header>
        <main className="client-portal-main">
          <div className="panel client-empty-state">
            <BarChart3 size={28} />
            <h2>Loading client dashboard</h2>
            <p>Fetching assigned projects and current collection metrics.</p>
          </div>
        </main>
      </section>
    );
  }

  if (projectsLoaded && projects.length === 0) {
    return (
      <section className="client-portal">
        <header className="client-portal-topbar">
          <div className="client-login-brand">
            <img src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
            <span>VTRAC Client Portal</span>
          </div>
          <button className="secondary client-logout-button" onClick={onLogout}><LogOut size={17} /> Logout</button>
        </header>
        <main className="client-portal-main">
          <div className="panel client-empty-state">
            <ShieldCheck size={28} />
            <h2>No projects assigned yet</h2>
            <p>Your client login is active, but no survey projects have been enabled for this account.</p>
          </div>
        </main>
      </section>
    );
  }

  return (
    <section className="client-portal">
      <header className="client-portal-topbar">
        <div className="client-login-brand">
          <img src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
          <span>VTRAC Client Portal</span>
        </div>
        <button className="secondary client-logout-button" onClick={onLogout}><LogOut size={17} /> Logout</button>
      </header>

      <main className="client-portal-main">
        <section className="client-overview-hero">
          <div>
            <p className="eyebrow">Client Dashboard</p>
            <h2>{selectedProject?.name || 'Survey analytics'}</h2>
            <p>
              Read-only progress view for approved client users. Figures update from submitted field responses.
            </p>
            <div className="client-chip-row">
              <span className="client-chip"><CalendarClock size={15} /> {dateScope}</span>
              <span className="client-chip"><ClipboardList size={15} /> {formatStatNumber(totalSamples)} samples</span>
              <span className="client-chip"><ShieldCheck size={15} /> {projects.length} assigned project{projects.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="client-live-card">
            <span>Collection Status</span>
            <strong>{totalSamples > 0 ? 'Live' : 'Awaiting data'}</strong>
            <p>{latestDate ? `Latest: ${formatProjectDate(latestDate.date)}` : 'No submissions yet'}</p>
          </div>
        </section>

        <div className="panel client-control-panel">
          <label className="client-project-field">
            Project
            <select value={selectedProject?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label>
            Date from
            <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
          </label>
          <label>
            Date to
            <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
          </label>
          <div className="client-control-actions">
            <button className="secondary" onClick={clearDateFilters} disabled={!filters.dateFrom && !filters.dateTo}>Clear dates</button>
            <button className="primary compact-refresh" onClick={loadDashboard} disabled={loading}><RefreshCw size={17} /> {loading ? 'Refreshing' : 'Refresh'}</button>
          </div>
        </div>

        {loading && <p className="status client-loading">Refreshing client dashboard...</p>}

        <div className="summary-kpi-grid client-summary-kpi-grid">
          <SummaryKpiCard icon={<ClipboardList size={18} />} label="Total samples" value={formatStatNumber(totalSamples)} detail={`${formatStatNumber(averagePerDay)} avg/day`} accent="teal" />
          <SummaryKpiCard icon={<CalendarClock size={18} />} label="Samples today" value={formatStatNumber(todaySamples)} detail={`${formatPercent(todaySamples, totalSamples)} of filtered total`} accent="blue" />
          <SummaryKpiCard icon={<MapPin size={18} />} label="Field locations" value={formatStatNumber(locationRows.length)} detail={topLocation ? `${truncateText(topLocation.label, 32)} leads` : 'No locations yet'} accent="sky" />
          <SummaryKpiCard icon={<PieChart size={18} />} label="Airport split" value={formatStatNumber(coveredTerminalRows.length || terminalRows.length)} detail={leadingMovement ? `${leadingMovement.label} leads` : 'No movement split yet'} accent="amber" />
        </div>

        <div className="summary-dashboard-grid client-modern-grid">
          <div className="panel summary-card summary-trend-card" data-export-graph data-export-title="client-daily-sample-trend">
            <div className="summary-card-head">
              <div>
                <span>Trend</span>
                <h3><TrendingUp size={17} /> Daily sample trend</h3>
              </div>
              <div className="summary-card-actions">
                <strong>{formatStatNumber(totalSamples)} total</strong>
                <GraphDownloadButtons filename="vtrac-client-daily-sample-trend" />
              </div>
            </div>
            <TrendLineChart rows={dateRows} labelKey="date" valueKey="samples" />
            <div className="summary-date-strip">
              {dateRows.slice(0, 4).map((row) => (
                <span key={row.date}><strong>{formatStatNumber(row.samples)}</strong>{formatProjectDate(row.date)}</span>
              ))}
            </div>
          </div>

          <div className="panel summary-card summary-mix-card" data-export-graph data-export-title="client-terminal-coverage">
            <div className="summary-card-head">
              <div>
                <span>Split</span>
                <h3><PieChart size={17} /> Terminal coverage</h3>
              </div>
              <GraphDownloadButtons filename="vtrac-client-terminal-coverage" />
            </div>
            {terminalChartRows.length ? <DonutQuestionChart rows={terminalChartRows} /> : <p className="empty">No terminal split yet.</p>}
          </div>

          <div className="panel summary-card summary-mix-card" data-export-graph data-export-title="client-movement-mix">
            <div className="summary-card-head">
              <div>
                <span>Flow</span>
                <h3><PieChart size={17} /> Movement mix</h3>
              </div>
              <GraphDownloadButtons filename="vtrac-client-movement-mix" />
            </div>
            {movementChartRows.length ? <DonutQuestionChart rows={movementChartRows} /> : <p className="empty">No movement split yet.</p>}
          </div>

          <SummaryRankCard title="Survey point performance" rows={surveyPointChartRows} icon={<BarChart3 size={17} />} />
          <SummaryRankCard title="Top survey locations" rows={locationChartRows} icon={<MapPin size={17} />} />
        </div>
      </main>
    </section>
  );
}

function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem('vtracAdminToken') || '');
  const session = useMemo(() => decodeTokenClaims(token), [token]);

  function handleLogin(nextToken) {
    localStorage.setItem('vtracAdminToken', nextToken);
    setToken(nextToken);
  }

  function logout() {
    localStorage.removeItem('vtracAdminToken');
    setToken('');
  }

  if (!token) return <AdminLogin onLogin={handleLogin} />;
  return <AdminDashboard token={token} session={session} onLogout={logout} />;
}

function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setStatus('');
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const payload = await response.json();
      if (!response.ok) return setStatus(payload.error || 'Unable to login.');
      onLogin(payload.token);
    } catch {
      setStatus('Unable to reach the login service. Check deployment and network connectivity.');
    } finally {
      setLoading(false);
    }
  }

  const navItems = ['Product', 'PeopleOS', 'Solutions', 'Pricing', 'Resources'];
  const previewMetrics = [
    { label: 'Live samples', value: '9.5K', icon: ClipboardList },
    { label: 'Daily run-rate', value: '1.4K', icon: TrendingUp },
    { label: 'QA ready', value: '94%', icon: ShieldCheck }
  ];

  const loginForm = (
    <form id="login" className="admin-login-card modern-auth-card vtrac-modal-auth-card" onSubmit={submit}>
      <div className="vtrac-modal-auth-heading">
        <p className="eyebrow">Staff access</p>
        <h2 id="vtrac-modal-login-title">Login to VTRAC Survey Portal</h2>
      </div>
      <label>
        Username or email
        <input
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setStatus('');
          }}
          required
          autoComplete="username"
          placeholder="Email or Username"
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setStatus('');
          }}
          required
          autoComplete="current-password"
          placeholder="Password"
        />
      </label>
      <button className="primary" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
      {status && <p className="status">{status}</p>}
    </form>
  );

  return (
    <section className="admin-login-screen vtrac-landing-login">
      <div className="vtrac-landing-backdrop" aria-hidden="true" />
      <header className="admin-login-topbar vtrac-landing-nav">
        <a className="vtrac-landing-brand" href="/admin" aria-label="VTRAC Survey Portal admin login">
          <img src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
          <span>VTRAC SurveyOS</span>
        </a>
        <nav className="vtrac-landing-menu" aria-label="Survey portal sections">
          {navItems.map((item) => (
            <a key={item} href="#platform">{item}</a>
          ))}
        </nav>
        <button type="button" className="vtrac-login-link" onClick={() => setLoginOpen(true)}>
          <UserRound size={18} /> Login
        </button>
      </header>

      <main className="admin-login-shell vtrac-landing-shell" id="platform">
        <section className="vtrac-hero-copy" aria-labelledby="vtrac-login-title">
          <h1 id="vtrac-login-title">Modern survey platform for field intelligence</h1>
          <p>
            VTRAC brings enterprise-scale survey collection, live field monitoring, QA review, maps, and client-ready reporting into one connected platform.
          </p>
        </section>

        <section className="vtrac-dashboard-preview" aria-label="VTRAC survey dashboard preview">
          <div className="vtrac-preview-topbar">
            <span className="vtrac-preview-mark">V</span>
            <strong>Bengaluru Airport Mobility Survey</strong>
            <div className="vtrac-preview-search">
              <Search size={16} />
              <span>Search projects, teams, locations</span>
            </div>
            <span className="vtrac-preview-live">Live</span>
          </div>
          <div className="vtrac-preview-body">
            <aside className="vtrac-preview-rail">
              <span className="active"><ClipboardList size={18} /> Home</span>
              <span><MapPin size={18} /> Field Ops</span>
              <span><BarChart3 size={18} /> Analytics</span>
              <span><Settings size={18} /> Settings</span>
            </aside>
            <div className="vtrac-preview-content">
              <div className="vtrac-preview-metrics">
                {previewMetrics.map(({ label, value, icon: Icon }) => (
                  <div key={label}>
                    <span className="vtrac-metric-icon"><Icon size={18} /></span>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="vtrac-preview-grid">
                <div className="vtrac-preview-card wide trend-card">
                  <div className="vtrac-card-heading">
                    <div>
                      <span>Trend</span>
                      <strong>Fieldwork velocity</strong>
                    </div>
                    <em>+18%</em>
                  </div>
                  <div className="vtrac-trend-visual" aria-hidden="true">
                    <svg viewBox="0 0 420 150" role="img">
                      <defs>
                        <linearGradient id="vtracTrendFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#14b8b2" stopOpacity="0.42" />
                          <stop offset="100%" stopColor="#14b8b2" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path className="trend-fill" d="M12 118 L12 94 C56 88 78 70 115 76 C157 84 173 44 213 52 C257 62 274 32 314 38 C352 44 372 24 408 18 L408 132 L12 132 Z" />
                      <path className="trend-line" d="M12 94 C56 88 78 70 115 76 C157 84 173 44 213 52 C257 62 274 32 314 38 C352 44 372 24 408 18" />
                      <circle cx="408" cy="18" r="6" />
                    </svg>
                  </div>
                  <div className="vtrac-trend-labels">
                    <span>Mon</span>
                    <span>9.5K samples</span>
                    <span>Sun</span>
                  </div>
                </div>
                <div className="vtrac-preview-card mix-card">
                  <div className="vtrac-card-heading">
                    <div>
                      <span>Split</span>
                      <strong>Terminal mix</strong>
                    </div>
                  </div>
                  <div className="vtrac-donut" aria-hidden="true">
                    <span>68%</span>
                  </div>
                  <div className="vtrac-chip-list">
                    <span><i /> Terminal 1</span>
                    <span><i /> Terminal 2</span>
                  </div>
                </div>
                <div className="vtrac-preview-card quality-card">
                  <div className="vtrac-card-heading">
                    <div>
                      <span>Quality</span>
                      <strong>Review readiness</strong>
                    </div>
                  </div>
                  <div className="vtrac-quality-bars" aria-hidden="true">
                    <span style={{ '--value': '92%' }}><b>Sync</b><i /></span>
                    <span style={{ '--value': '86%' }}><b>GPS</b><i /></span>
                    <span style={{ '--value': '94%' }}><b>QC</b><i /></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {loginOpen && (
        <div className="vtrac-login-modal" role="dialog" aria-modal="true" aria-labelledby="vtrac-modal-login-title">
          <button type="button" className="vtrac-login-modal-scrim" aria-label="Close login" onClick={() => setLoginOpen(false)} />
          <section className="vtrac-login-modal-panel">
            <div className="vtrac-login-modal-visual">
              <img src="/vtrac-login-bg.png" alt="" />
              <div>
                <strong>Collect. Monitor. Assure.</strong>
                <span>Secure survey operations for VTRAC teams and clients.</span>
              </div>
            </div>
            <div className="vtrac-login-modal-form">
              <button type="button" className="vtrac-login-modal-close" onClick={() => setLoginOpen(false)} aria-label="Close login">
                <X size={22} />
              </button>
              <div className="vtrac-modal-brand">
                <img src="/vtrac-logo.jpg" alt="VTRAC" />
                <span>VTRAC</span>
              </div>
              {loginForm}
              <div className="vtrac-auth-divider"><span>Quick access</span></div>
              <div className="vtrac-auth-links">
                <a href="/client"><UserRound size={18} /> Client login</a>
                <a href="/survey"><ExternalLink size={18} /> Open survey link</a>
              </div>
              <AccountRecoveryControls accountType="staff" />
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function AdminDashboard({ token, session, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [foundation, setFoundation] = useState({ organisation: null, workspace: null, roles: [], permissions: [], navigation: [], counts: {} });
  const [users, setUsers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [recoveryRequests, setRecoveryRequests] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ enumerators: [], locations: [] });
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [bulkUserText, setBulkUserText] = useState('');
  const [bulkUserWorking, setBulkUserWorking] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [organisationDraft, setOrganisationDraft] = useState(null);
  const [editingResponse, setEditingResponse] = useState(null);
  const [responseMode, setResponseMode] = useState('edit');
  const [audioPreview, setAudioPreview] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const projectSearchInputRef = useRef(null);
  const [projectStatusFilter, setProjectStatusFilter] = useState('deployed');
  const isInitialSurveyDesigner = normalizeAdminRoleKey(session?.role) === 'surveyDesigner';
  const [activeAdminSection, setActiveAdminSection] = useState(isInitialSurveyDesigner ? 'projectWorkspace' : 'overview');
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const [projectWorkspaceTab, setProjectWorkspaceTab] = useState(isInitialSurveyDesigner ? 'form' : 'summary');
  const [projectDataTab, setProjectDataTab] = useState('table');
  const [projectSettingsTab, setProjectSettingsTab] = useState('general');
  const [filters, setFilters] = useState({ enumerator: '', location: '', dateFrom: '', dateTo: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [exportType, setExportType] = useState('xlsx');
  const [exportHeaderFormat, setExportHeaderFormat] = useState('labels');
  const [advancedExportsOpen, setAdvancedExportsOpen] = useState(false);
  const [generalDraft, setGeneralDraft] = useState({ name: '', description: '', sector: 'Other', country: 'India' });
  const [clearDataModalOpen, setClearDataModalOpen] = useState(false);
  const [clearDataConfirmation, setClearDataConfirmation] = useState('');
  const [clearDataBackups, setClearDataBackups] = useState([]);
  const [clearDataWorking, setClearDataWorking] = useState(false);
  const [restoreBackupTarget, setRestoreBackupTarget] = useState(null);
  const [restoreDataConfirmation, setRestoreDataConfirmation] = useState('');
  const [restoreDataWorking, setRestoreDataWorking] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const selectedProject = projects.find((project) => project.id === selectedId) || projects[0];
  const settingsSections = useMemo(() => [
    ['general', 'General', <Settings size={19} />],
    ['media', 'Media', <ImageIcon size={19} />],
    ['rest', 'REST Services', <FileText size={19} />],
    ['activity', 'Activity', <CalendarClock size={19} />]
  ], []);
  const visibleSettingsTabIds = useMemo(() => settingsSections.map(([tab]) => tab), [settingsSections]);
  const filteredProjects = projects.filter((project) => {
    const search = projectSearch.trim().toLowerCase();
    const status = getProjectStatus(project);
    const matchesSearch = !search || `${project.name} ${project.slug}`.toLowerCase().includes(search);
    const matchesStatus =
      projectStatusFilter === 'all' ||
      projectStatusFilter === status;
    return matchesSearch && matchesStatus;
  });
  const projectCounts = {
    all: projects.length,
    deployed: projects.filter((project) => getProjectStatus(project) === 'deployed').length,
    draft: projects.filter((project) => getProjectStatus(project) === 'draft').length,
    archived: projects.filter((project) => getProjectStatus(project) === 'archived').length
  };
  const selectedVisibleProjects = filteredProjects.filter((project) => selectedProjectIds.includes(project.id));
  const allVisibleProjectsSelected = filteredProjects.length > 0 && selectedVisibleProjects.length === filteredProjects.length;
  const totalProjectSubmissions = projects.reduce((sum, project) => sum + Number(project.responseCount || 0), 0);
  const isPortfolioSection = activeAdminSection === 'overview' || activeAdminSection === 'library';
  const clientProjectRows = clients.map((client) => ({
    label: client.displayName || client.username,
    samples: client.projectIds?.length || 0
  }));
  const selectedProjectLatest = data?.recent?.[0]?.submitted_at ? formatProjectDate(data.recent[0].submitted_at) : '-';
  const selectedProjectQuestions = selectedProject?.questions?.length || 0;
  const selectedProjectStatus = getProjectStatus(selectedProject);
  const activeConsoleTitle = activeAdminSection === 'projectWorkspace' && selectedProject
    ? selectedProject.name
    : activeAdminSection === 'overview'
      ? 'SurveyOS - VTRAC Workspace'
      : activeAdminSection === 'library'
        ? 'SurveyOS - Portfolio Analytics'
        : activeAdminSection === 'organisation'
          ? 'SurveyOS - Organisation Context'
          : activeAdminSection === 'users'
            ? 'SurveyOS - Users & RBAC'
            : activeAdminSection === 'clients'
              ? 'SurveyOS - Clients'
              : activeAdminSection === 'vendors'
                ? 'SurveyOS - Vendors'
                : 'SurveyOS - Project Library';
  const authHeaders = { Authorization: `Bearer ${token}` };
  const currentRoleKey = normalizeAdminRoleKey(session?.role || 'admin');
  const currentPermissions = rolePermissionsFor(session?.role || currentRoleKey, foundation.roles);
  const currentRoleLabel = displayRoleName(session?.role || currentRoleKey, foundation.roles);
  const isSurveyDesignerMode = currentRoleKey === 'surveyDesigner';
  const currentRoleInfo = foundation.roles.find((role) => role.key === currentRoleKey || role.key === session?.role) || {
    key: currentRoleKey,
    name: currentRoleLabel,
    scope: currentRoleKey === 'platformSuperAdmin' ? 'platform' : 'workspace',
    permissions: [...currentPermissions]
  };
  const currentUserLabel = session?.displayName || session?.username || 'Admin';

  function hasAdminPermission(permission) {
    return hasPermissionInSet(currentPermissions, permission);
  }

  function canAccessAdminSection(section) {
    if (isSurveyDesignerMode && ['overview', 'organisation', 'users', 'clients', 'vendors', 'library'].includes(section)) return false;
    return canAccessSection(section, currentPermissions);
  }

  function isNavItemAllowed(item) {
    const sectionAllowed = item.section ? canAccessAdminSection(item.section) : true;
    const permissionAllowed = item.permission ? hasAdminPermission(item.permission) : true;
    return sectionAllowed && permissionAllowed;
  }

  useEffect(() => {
    if (!selectedProject) return;
    setGeneralDraft({
      name: selectedProject.name || '',
      description: selectedProject.description || '',
      sector: selectedProject.settings?.sector || 'Other',
      country: selectedProject.settings?.country || 'India'
    });
  }, [selectedProject?.id, selectedProject?.name, selectedProject?.description, selectedProject?.settings?.sector, selectedProject?.settings?.country]);

  useEffect(() => {
    if (!isSurveyDesignerMode || !projects.length) return;
    const designerProject = selectedProject || projects[0];
    if (!designerProject) return;
    if (selectedId !== designerProject.id) changeSelectedProject(designerProject.id);
    if (activeAdminSection !== 'projectWorkspace') setActiveAdminSection('projectWorkspace');
    if (projectWorkspaceTab !== 'form') setProjectWorkspaceTab('form');
    if (!editing || editing.id !== designerProject.id) setEditing(projectToEditingDraft(designerProject));
  }, [isSurveyDesignerMode, projects.length, selectedProject?.id, selectedId, activeAdminSection, projectWorkspaceTab, editing?.id]);

  useEffect(() => {
    if (!visibleSettingsTabIds.includes(projectSettingsTab)) setProjectSettingsTab('general');
  }, [projectSettingsTab, visibleSettingsTabIds]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (isPortfolioSection) params.set('excludePilot', '1');
    if (!isPortfolioSection && selectedProject?.id) params.set('projectId', selectedProject.id);
    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [appliedFilters, isPortfolioSection, selectedProject?.id]);

  async function loadProjects() {
    const response = await fetch(`${apiBase}/api/projects`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    setProjects(payload.projects || []);
    setSelectedId((current) => current || payload.projects?.[0]?.id || '');
  }

  async function loadFoundation() {
    const response = await fetch(`${apiBase}/api/admin/foundation`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    setFoundation({
      organisation: payload.organisation || null,
      workspace: payload.workspace || null,
      roles: payload.roles || [],
      permissions: payload.permissions || [],
      navigation: payload.navigation || [],
      counts: payload.counts || {}
    });
    setUsers((payload.users || []).map((user) => ({
      ...user,
      assignedProjectIds: Array.isArray(user.assignedProjectIds) ? user.assignedProjectIds : []
    })));
    setVendors((payload.vendors || []).map((vendor) => ({
      ...vendor,
      assignedProjectIds: Array.isArray(vendor.assignedProjectIds) ? vendor.assignedProjectIds : []
    })));
    if (payload.clients) {
      setClients(payload.clients.map((client) => ({
        ...client,
        projectIds: Array.isArray(client.projectIds) ? client.projectIds : []
      })));
    }
    const organisation = payload.organisation || {};
    const workspace = payload.workspace || {};
    setOrganisationDraft({
      name: organisation.name || '',
      legalName: organisation.legalName || '',
      website: organisation.website || '',
      primaryContactName: organisation.primaryContactName || '',
      primaryContactEmail: organisation.primaryContactEmail || '',
      primaryContactPhone: organisation.primaryContactPhone || '',
      workspaceName: workspace.name || '',
      workspaceDescription: workspace.description || ''
    });
  }

  async function loadClients() {
    const response = await fetch(`${apiBase}/api/admin/clients`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    setClients((payload.clients || []).map((client) => ({
      ...client,
      projectIds: Array.isArray(client.projectIds) ? client.projectIds : []
    })));
  }

  async function loadRecoveryRequests() {
    const response = await fetch(`${apiBase}/api/admin/recovery-requests`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    setRecoveryRequests(payload.requests || []);
  }

  async function loadFilterOptions() {
    if (!isPortfolioSection && !selectedProject) return;
    const params = new URLSearchParams();
    if (!isPortfolioSection && selectedProject?.id) params.set('projectId', selectedProject.id);
    const response = await fetch(`${apiBase}/api/dashboard/options?${params.toString()}`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    setFilterOptions({
      enumerators: payload.enumerators || [],
      locations: payload.locations || []
    });
  }

  async function loadDashboard() {
    if (!isPortfolioSection && !selectedProject) return;
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/dashboard?${queryString}`, { headers: authHeaders });
      if (response.status === 401) return onLogout();
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  }

  async function refreshAdminData() {
    await Promise.all([
      loadProjects(),
      loadFoundation(),
      loadClients(),
      loadRecoveryRequests(),
      loadDashboard(),
      loadFilterOptions()
    ]);
    setStatus('Dashboard data refreshed.');
  }

  function changeSelectedProject(projectId) {
    const emptyFilters = { enumerator: '', location: '', dateFrom: '', dateTo: '' };
    setSelectedId(projectId);
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  }

  function openAdminSection(section) {
    if (!canAccessAdminSection(section)) {
      setStatus(`Your role (${currentRoleLabel}) does not include access to this page.`);
      return;
    }
    setActiveAdminSection(section);
    setEditing(null);
    setEditingClient(null);
    setEditingUser(null);
    setEditingVendor(null);
    setEditingResponse(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function filterProjects(statusFilter) {
    if (!canAccessAdminSection('projects')) {
      setStatus(`Your role (${currentRoleLabel}) does not include access to project lists.`);
      return;
    }
    setProjectStatusFilter(statusFilter);
    openAdminSection('projects');
  }

  function toggleProjectSelection(projectId, checked) {
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      if (checked) next.add(projectId);
      else next.delete(projectId);
      return [...next];
    });
  }

  function openProjectWorkspace(project, tab = isSurveyDesignerMode ? 'form' : 'summary') {
    changeSelectedProject(project.id);
    setActiveAdminSection('projectWorkspace');
    setProjectWorkspaceTab(tab);
    setEditing(tab === 'form' && isSurveyDesignerMode ? projectToEditingDraft(project) : null);
    setEditingClient(null);
    setEditingResponse(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function copyPublicLink() {
    if (!selectedProject) return;
    const link = `${window.location.origin}${selectedProject.publicUrl}`;
    navigator.clipboard?.writeText(link);
    setStatus('Public survey link copied.');
  }

  function toggleVisibleProjectSelection(checked) {
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      filteredProjects.forEach((project) => {
        if (checked) next.add(project.id);
        else next.delete(project.id);
      });
      return [...next];
    });
  }

  useEffect(() => {
    loadProjects();
    loadFoundation();
    loadClients();
    loadRecoveryRequests();
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [queryString]);

  useEffect(() => {
    loadFilterOptions();
  }, [isPortfolioSection, selectedProject?.id]);

  useEffect(() => {
    if (activeAdminSection === 'projectWorkspace' && projectWorkspaceTab === 'data' && projectDataTab === 'cleanup' && selectedProject?.id) {
      loadClearDataBackups(selectedProject.id);
    }
  }, [activeAdminSection, projectWorkspaceTab, projectDataTab, selectedProject?.id]);

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    setAudioPreview(null);

    if (!editingResponse?.hasAudio) return undefined;

    async function loadAudioPreview() {
      try {
        const response = await fetch(`${apiBase}/api/responses/${editingResponse.id}/audio`, { headers: authHeaders });
        if (response.status === 401) return onLogout();
        if (!response.ok) {
          if (!cancelled) setAudioPreview({ error: 'Audio recording is not available.' });
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setAudioPreview({
            url: objectUrl,
            mimeType: blob.type || editingResponse.audioMimeType || 'audio/webm'
          });
        }
      } catch {
        if (!cancelled) setAudioPreview({ error: 'Unable to load audio preview.' });
      }
    }

    loadAudioPreview();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [editingResponse?.id, editingResponse?.hasAudio]);

  function startNewProject() {
    setActiveAdminSection('projects');
    setEditing({
      name: '',
      slug: '',
      description: '',
      locations: 'Kadiri\nAnantapur\nOther',
      settings: normalizeSurveySettings(),
      isActive: true,
      questions: [{ ...blankQuestion, label: 'Sample question', type: 'text', required: true }]
    });
  }

  function projectToEditingDraft(project) {
    return {
      ...project,
      locations: Array.isArray(project.locations) ? project.locations.join('\n') : project.locations || '',
      settings: normalizeSurveySettings(project.settings, project.slug),
      questions: (project.questions || []).map((question) => ({
        ...question,
        options: Array.isArray(question.options) ? question.options.join('\n') : question.options || ''
      }))
    };
  }

  function editProject(project) {
    setEditing(projectToEditingDraft(project));
  }

  async function saveProject(project, successMessage = 'Project saved.') {
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
      return null;
    }
    setStatus(successMessage);
    setEditing(null);
    await loadProjects();
    setSelectedId(payload.project.id);
    return payload.project;
  }

  async function saveGeneralSettings() {
    if (!selectedProject) return;
    await saveProject({
      ...selectedProject,
      name: generalDraft.name,
      description: generalDraft.description,
      settings: {
        ...(selectedProject.settings || {}),
        sector: generalDraft.sector,
        country: generalDraft.country
      }
    });
  }

  async function archiveSelectedProject() {
    if (!selectedProject) return;
    const confirmed = window.confirm(`Archive "${selectedProject.name}"? This will stop the public survey link from accepting new submissions.`);
    if (!confirmed) return;

    const archivedProject = await saveProject({
      ...selectedProject,
      isActive: false,
      settings: {
        ...(selectedProject.settings || {}),
        status: 'archived',
        archivedAt: new Date().toISOString()
      }
    }, 'Project archived. Public submissions are now disabled for this project.');
    if (!archivedProject) return;
    setProjectStatusFilter('archived');
    setActiveAdminSection('projects');
    setStatus('Project archived. Public submissions are now disabled for this project.');
  }

  function startNewClient() {
    setEditingClient({
      username: '',
      email: '',
      displayName: '',
      password: '',
      isActive: true,
      projectIds: selectedProject?.id ? [selectedProject.id] : []
    });
  }

  function editClient(client) {
    setEditingClient({ ...client, password: '' });
  }

  async function saveClient(client) {
    setStatus('');
    const method = client.id ? 'PUT' : 'POST';
    const url = client.id ? `${apiBase}/api/admin/clients/${client.id}` : `${apiBase}/api/admin/clients`;
    const response = await fetch(url, {
      method,
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(client)
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || 'Unable to save client.');
      return;
    }
    setStatus(payload.message || 'Client access saved.');
    setEditingClient(null);
    await loadClients();
  }

  async function resolveRecoveryRequest(requestId) {
    setStatus('');
    const response = await fetch(`${apiBase}/api/admin/recovery-requests/${requestId}/resolve`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' }
    });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || 'Unable to resolve recovery request.');
      return;
    }
    setStatus('Recovery request marked resolved.');
    await loadRecoveryRequests();
  }

  async function saveOrganisationContext() {
    if (!organisationDraft) return;
    setStatus('');
    const response = await fetch(`${apiBase}/api/admin/organisation`, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(organisationDraft)
    });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || 'Unable to save organisation context.');
      return;
    }
    setStatus(payload.message || 'Organisation context saved.');
    await loadFoundation();
  }

  function startNewUser() {
    setEditingUser({
      username: '',
      email: '',
      displayName: '',
      role: 'analyst',
      branch: '',
      team: '',
      password: '',
      isActive: true,
      assignedProjectIds: selectedProject?.id ? [selectedProject.id] : []
    });
  }

  function editUser(user) {
    setEditingUser({
      ...user,
      assignedProjectIds: Array.isArray(user.assignedProjectIds) ? user.assignedProjectIds : [],
      password: ''
    });
  }

  async function saveUserAccess(user) {
    setStatus('');
    const method = user.id ? 'PUT' : 'POST';
    const url = user.id ? `${apiBase}/api/admin/users/${user.id}` : `${apiBase}/api/admin/users`;
    const response = await fetch(url, {
      method,
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || 'Unable to save user.');
      return;
    }
    setStatus(payload.message || 'User access saved.');
    setEditingUser(null);
    await loadFoundation();
  }

  async function bulkCreateUsers() {
    const usersToCreate = parseBulkUserRows(bulkUserText);
    if (usersToCreate.length === 0) {
      setStatus('Paste at least one user row: Display Name, email, username, role, temporary password.');
      return;
    }
    setBulkUserWorking(true);
    setStatus('');
    let createdCount = 0;
    const errors = [];
    try {
      for (const user of usersToCreate) {
        const response = await fetch(`${apiBase}/api/admin/users`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(user)
        });
        if (response.status === 401) return onLogout();
        const payload = await response.json().catch(() => ({}));
        if (response.ok) createdCount += 1;
        else errors.push(`${user.username}: ${payload.error || 'not created'}`);
      }
      await loadFoundation();
      if (createdCount && errors.length === 0) setBulkUserText('');
      setStatus(`${createdCount} user ID${createdCount === 1 ? '' : 's'} created.${errors.length ? ' Review: ' + errors.slice(0, 3).join('; ') : ''}`);
    } finally {
      setBulkUserWorking(false);
    }
  }

  function startNewVendor() {
    setEditingVendor({
      name: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      serviceArea: '',
      status: 'Active',
      loginUsername: '',
      loginPassword: '',
      assignedProjectIds: selectedProject?.id ? [selectedProject.id] : [],
      notes: ''
    });
  }

  function editVendor(vendor) {
    setEditingVendor({
      ...vendor,
      loginUsername: vendor.loginUsername || '',
      loginPassword: '',
      assignedProjectIds: Array.isArray(vendor.assignedProjectIds) ? vendor.assignedProjectIds : []
    });
  }

  async function saveVendorAccess(vendor) {
    setStatus('');
    const method = vendor.id ? 'PUT' : 'POST';
    const url = vendor.id ? `${apiBase}/api/admin/vendors/${vendor.id}` : `${apiBase}/api/admin/vendors`;
    const response = await fetch(url, {
      method,
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(vendor)
    });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || 'Unable to save vendor.');
      return;
    }
    setStatus(payload.message || 'Vendor saved.');
    setEditingVendor(null);
    await loadFoundation();
  }

  async function openResponse(responseId, mode = 'view') {
    setStatus('');
    const response = await fetch(`${apiBase}/api/responses/${responseId}`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || 'Unable to load response.');
      return;
    }
    setResponseMode(mode);
    setEditingResponse(payload.response);
  }

  async function saveResponse(responseDraft) {
    setStatus('');
    const response = await fetch(`${apiBase}/api/responses/${responseDraft.id}`, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(responseDraft)
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || 'Unable to save response.');
      return;
    }
    setStatus(`Response ${payload.response.id} saved.`);
    setEditingResponse(null);
    await loadDashboard();
  }

  async function downloadAudio(responseId) {
    const response = await fetch(`${apiBase}/api/responses/${responseId}/audio`, { headers: authHeaders });
    if (!response.ok) {
      setStatus('Audio recording is not available.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vtrac-response-${responseId}-audio.${audioExtensionFromMime(blob.type || response.headers.get('Content-Type'))}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function download(type = exportType) {
    const exportQuery = new URLSearchParams(queryString);
    exportQuery.set('headerFormat', exportHeaderFormat);
    const response = await fetch(`${apiBase}/api/responses/export.${type}?${exportQuery.toString()}`, { headers: authHeaders });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatus(payload.error || 'Unable to download export.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vtrac-${isPortfolioSection ? 'portfolio' : selectedProject.slug}-responses.${type}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleExportSubmit() {
    download(exportType);
  }

  async function loadClearDataBackups(projectId = selectedProject?.id) {
    if (!projectId) return;
    const response = await fetch(`${apiBase}/api/projects/${projectId}/response-backups`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(payload.error || 'Unable to load cleanup backup history.');
      return;
    }
    setClearDataBackups(payload.backups || []);
  }

  async function openClearDataModal() {
    if (!selectedProject) return;
    setStatus('');
    setClearDataConfirmation('');
    setClearDataModalOpen(true);
    await loadClearDataBackups(selectedProject.id);
  }

  async function clearProjectResponses() {
    if (!selectedProject || clearDataConfirmation.trim() !== 'CLEAR DATA') return;
    setClearDataWorking(true);
    setStatus('');
    try {
      const response = await fetch(`${apiBase}/api/projects/${selectedProject.id}/responses`, {
        method: 'DELETE',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: clearDataConfirmation.trim() })
      });
      if (response.status === 401) return onLogout();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(payload.error || 'Unable to clear submitted data.');
        return;
      }
      const backupNote = payload.backup?.expiresAt ? ` Backup retained until ${formatProjectDateTime(payload.backup.expiresAt)}.` : '';
      setStatus(`${payload.deletedCount || 0} submitted responses cleared.${backupNote}`);
      setClearDataConfirmation('');
      await loadProjects();
      await loadDashboard();
      await loadClearDataBackups(selectedProject.id);
    } finally {
      setClearDataWorking(false);
    }
  }

  function openRestoreBackupModal(backup) {
    setStatus('');
    setRestoreBackupTarget(backup);
    setRestoreDataConfirmation('');
  }

  async function restoreBackupResponses() {
    if (!selectedProject || !restoreBackupTarget || restoreDataConfirmation.trim() !== 'RESTORE DATA') return;
    setRestoreDataWorking(true);
    setStatus('');
    try {
      const response = await fetch(`${apiBase}/api/projects/${selectedProject.id}/response-backups/${restoreBackupTarget.id}/restore`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: restoreDataConfirmation.trim() })
      });
      if (response.status === 401) return onLogout();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(payload.error || 'Unable to restore backup.');
        return;
      }
      setStatus(`${payload.restoredCount || 0} responses restored from backup #${restoreBackupTarget.id}.`);
      setRestoreBackupTarget(null);
      setRestoreDataConfirmation('');
      await loadProjects();
      await loadDashboard();
      await loadClearDataBackups(selectedProject.id);
    } finally {
      setRestoreDataWorking(false);
    }
  }

  const platformNavItems = (isSurveyDesignerMode ? [
    { key: 'designer', label: 'Survey Designer', section: 'projectWorkspace', permission: 'surveys.design', icon: <FileText size={17} />, action: () => selectedProject ? openProjectWorkspace(selectedProject, 'form') : openAdminSection('projects'), active: activeAdminSection === 'projectWorkspace' && projectWorkspaceTab === 'form' },
    { key: 'projects', label: 'Assigned Projects', section: 'projects', permission: 'surveys.design', icon: <ClipboardList size={17} />, action: () => openAdminSection('projects'), active: activeAdminSection === 'projects' }
  ] : [
    { key: 'overview', label: 'Executive Dashboard', section: 'overview', icon: <Layers size={17} />, action: () => openAdminSection('overview'), active: activeAdminSection === 'overview' },
    { key: 'projects', label: 'Projects', section: 'projects', icon: <ClipboardList size={17} />, action: () => openAdminSection('projects'), active: activeAdminSection === 'projects' || activeAdminSection === 'projectWorkspace' },
    { key: 'library', label: 'Portfolio Analytics', section: 'library', icon: <BarChart3 size={17} />, action: () => openAdminSection('library'), active: activeAdminSection === 'library' }
  ]).filter(isNavItemAllowed);
  const governanceNavItems = (isSurveyDesignerMode ? [] : [
    { key: 'organisation', label: 'Organisation Context', section: 'organisation', icon: <UserRound size={17} />, action: () => openAdminSection('organisation'), active: activeAdminSection === 'organisation' },
    { key: 'users', label: 'Users & RBAC', section: 'users', icon: <UserSearch size={17} />, action: () => openAdminSection('users'), active: activeAdminSection === 'users' },
    { key: 'clients', label: 'Clients', section: 'clients', icon: <ShieldCheck size={17} />, action: () => openAdminSection('clients'), active: activeAdminSection === 'clients' },
    { key: 'vendors', label: 'Vendors', section: 'vendors', icon: <Share2 size={17} />, action: () => openAdminSection('vendors'), active: activeAdminSection === 'vendors' }
  ]).filter(isNavItemAllowed);
  const settingsNavItems = (isSurveyDesignerMode ? [
    { key: 'builder', label: 'Builder', section: 'projectWorkspace', permission: 'surveys.design', icon: <Layers size={17} />, action: () => selectedProject ? openProjectWorkspace(selectedProject, 'form') : openAdminSection('projects'), active: activeAdminSection === 'projectWorkspace' && projectWorkspaceTab === 'form' },
    { key: 'preview', label: 'Preview Form', section: 'projectWorkspace', permission: 'surveys.design', icon: <Eye size={17} />, action: () => selectedProject && window.open(selectedProject.publicUrl, '_blank'), active: false },
    { key: 'copy-link', label: 'Copy Survey Link', section: 'projectWorkspace', permission: 'surveys.design', icon: <Link2 size={17} />, action: copyPublicLink, active: false }
  ] : [
    { key: 'data-table', label: 'Response Table', section: 'projectWorkspace', icon: <Table2 size={17} />, action: () => { if (selectedProject) { setProjectDataTab('table'); openProjectWorkspace(selectedProject, 'data'); } else openAdminSection('projects'); }, active: activeAdminSection === 'projectWorkspace' && projectWorkspaceTab === 'data' && projectDataTab === 'table' },
    { key: 'downloads', label: 'Downloads', section: 'projectWorkspace', icon: <Download size={17} />, action: () => { if (selectedProject) { setProjectDataTab('downloads'); openProjectWorkspace(selectedProject, 'data'); } else openAdminSection('projects'); }, active: activeAdminSection === 'projectWorkspace' && projectWorkspaceTab === 'data' && projectDataTab === 'downloads' },
    { key: 'map', label: 'Map', section: 'projectWorkspace', icon: <MapPin size={17} />, action: () => { if (selectedProject) { setProjectDataTab('map'); openProjectWorkspace(selectedProject, 'data'); } else openAdminSection('projects'); }, active: activeAdminSection === 'projectWorkspace' && projectWorkspaceTab === 'data' && projectDataTab === 'map' },
    { key: 'project-settings', label: 'Project Settings', section: 'projectWorkspace', permission: 'projects.manage', icon: <Settings size={17} />, action: () => selectedProject ? openProjectWorkspace(selectedProject, 'settings') : openAdminSection('projects'), active: activeAdminSection === 'projectWorkspace' && projectWorkspaceTab === 'settings' }
  ]).filter(isNavItemAllowed);
  const projectStatusItems = [
    { key: 'all', label: 'All projects', count: projectCounts.all },
    { key: 'deployed', label: 'Deployed', count: projectCounts.deployed },
    { key: 'draft', label: 'Draft', count: projectCounts.draft },
    { key: 'archived', label: 'Archived', count: projectCounts.archived }
  ];

  return (
    <section className="admin-console">
      <div className="admin-console-topbar">
        <div className="admin-brand-mark">
          <img src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
          <span title={activeConsoleTitle}>
            {activeConsoleTitle}
          </span>
        </div>
        <div className="admin-topbar-context">
          <span>{currentRoleLabel}</span>
          <strong>{currentUserLabel}</strong>
        </div>
        <label className="admin-search">
          <Search size={22} />
          <input ref={projectSearchInputRef} value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" />
        </label>
        <button className="admin-avatar" onClick={onLogout} title="Logout" aria-label="Logout"><LogOut size={20} /></button>
      </div>

      <div className={`admin-console-shell surveyos-nav-shell ${menuCollapsed ? 'menu-collapsed' : ''}`}>
        <aside className="admin-sidebar surveyos-app-sidebar" aria-label="SurveyOS administration navigation">
          <div className="surveyos-sidebar-brand">
            <img src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
            <div>
              <strong>SurveyOS</strong>
              <span>Field Intelligence Platform</span>
            </div>
            <button
              className="admin-collapse-button surveyos-collapse-button"
              onClick={() => setMenuCollapsed(!menuCollapsed)}
              aria-label={menuCollapsed ? 'Expand menu' : 'Collapse menu'}
              title={menuCollapsed ? 'Expand menu' : 'Collapse menu'}
            >
              {menuCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>

          {hasAdminPermission('projects.manage') && (
            <button className="admin-new-button surveyos-new-button" onClick={startNewProject}>
              <Plus size={16} />
              <span>New Form</span>
            </button>
          )}

          <nav className="surveyos-sidebar-nav" aria-label="Platform sections">
            <p className="surveyos-nav-section-title">Workspace</p>
            {platformNavItems.map((item) => (
              <button type="button" className={item.active ? 'active' : ''} key={item.key} onClick={item.action} title={item.label}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}

            <p className="surveyos-nav-section-title">Project Status</p>
            {projectStatusItems.map((item) => (
              <button type="button" className={projectStatusFilter === item.key ? 'active compact' : 'compact'} key={item.key} onClick={() => filterProjects(item.key)} title={item.label}>
                <ClipboardList size={17} />
                <span>{item.label}</span>
                <strong className="surveyos-sidebar-count">{item.count}</strong>
              </button>
            ))}

            {governanceNavItems.length > 0 && <p className="surveyos-nav-section-title">Governance</p>}
            {governanceNavItems.map((item) => (
              <button type="button" className={item.active ? 'active' : ''} key={item.key} onClick={item.action} title={item.label}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}

            {settingsNavItems.length > 0 && <p className="surveyos-nav-section-title">Project Tools</p>}
            {settingsNavItems.map((item) => (
              <button type="button" className={item.active ? 'active' : ''} key={item.key} onClick={item.action} title={item.label}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="surveyos-sidebar-projects">
            <div>
              <span>Recent Projects</span>
              <strong>{filteredProjects.length}</strong>
            </div>
            {filteredProjects.slice(0, 6).map((project) => (
              <button
                className={project.id === selectedProject?.id ? 'active' : ''}
                key={project.id}
                onClick={() => openProjectWorkspace(project)}
                title={project.name}
              >
                <FileText size={15} />
                <span>{project.name}</span>
              </button>
            ))}
          </div>

          {selectedProject && activeAdminSection === 'projectWorkspace' && (
            <div className="admin-selected-card surveyos-selected-project">
              <span>Selected project</span>
              <strong>{selectedProject.name}</strong>
              <a href={selectedProject.publicUrl} target="_blank" rel="noreferrer"><Link2 size={15} /> Public survey link</a>
            </div>
          )}
        </aside>

        <div className="admin-main">
          {!canAccessAdminSection(activeAdminSection) && (
            <AccessRestrictedPanel roleLabel={currentRoleLabel} section={activeAdminSection} />
          )}

          {canAccessAdminSection('overview') && activeAdminSection === 'overview' && (
            <SurveyOSFoundationDashboard
              clients={clients}
              data={data}
              download={download}
              loading={loading}
              foundation={foundation}
              session={session}
              roleInfo={currentRoleInfo}
              users={users}
              vendors={vendors}
              onOpenAnalytics={() => openAdminSection('library')}
              onOpenClients={() => openAdminSection('clients')}
              onOpenOrganisation={() => openAdminSection('organisation')}
              onOpenUsers={() => openAdminSection('users')}
              onOpenVendors={() => openAdminSection('vendors')}
              onOpenProjectWorkspace={(tab = 'summary') => selectedProject && openProjectWorkspace(selectedProject, tab)}
              onOpenProjectMap={() => {
                if (selectedProject) {
                  setProjectDataTab('map');
                  openProjectWorkspace(selectedProject, 'data');
                } else {
                  openAdminSection('projects');
                }
              }}
              onOpenProjects={() => openAdminSection('projects')}
              onFocusSearch={() => projectSearchInputRef.current?.focus()}
              onRefresh={refreshAdminData}
              projects={projects}
              totalProjectSubmissions={totalProjectSubmissions}
            />
          )}

          {canAccessAdminSection('projects') && activeAdminSection === 'projects' && (
            <>
              <div className="admin-project-toolbar">
                <div>
                  <h2>My Projects</h2>
                  <p>{filteredProjects.length} shown · {projects.length} total · {projectStatusFilter}{selectedProjectIds.length > 0 ? ` · ${selectedProjectIds.length} selected` : ''}</p>
                </div>
              </div>

              <div className="admin-project-table">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <input
                            className="row-checkbox-input"
                            type="checkbox"
                            checked={allVisibleProjectsSelected}
                            disabled={filteredProjects.length === 0}
                            onChange={(event) => toggleVisibleProjectSelection(event.target.checked)}
                            aria-label="Select all visible projects"
                          />
                        </th>
                        <th>Project name</th>
                        <th>Status</th>
                        <th>Owner</th>
                        <th>Last modified</th>
                        <th>Date deployed</th>
                        <th>Submissions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.map((project) => {
                        const rowSelected = selectedProjectIds.includes(project.id);
                        const status = getProjectStatus(project);
                        return (
                          <tr className={`${project.id === selectedProject?.id ? 'selected-row' : ''} ${rowSelected ? 'checked-row' : ''}`.trim()} key={project.id} onClick={() => openProjectWorkspace(project)}>
                            <td>
                              <input
                                className="row-checkbox-input"
                                type="checkbox"
                                checked={rowSelected}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => toggleProjectSelection(project.id, event.target.checked)}
                                aria-label={`Select ${project.name}`}
                              />
                            </td>
                            <td>
                              <button className="project-name-button" onClick={(event) => { event.stopPropagation(); openProjectWorkspace(project); }}>
                                {project.name}
                              </button>
                              <small>{project.slug}</small>
                            </td>
                            <td><span className={`project-status ${status}`}>{status}</span></td>
                            <td>admin</td>
                            <td>{formatProjectDate(project.updatedAt)}</td>
                            <td>{project.isActive ? formatProjectDate(project.createdAt) : '-'}</td>
                            <td><span className="submission-pill">{project.responseCount || 0}</span></td>
                          </tr>
                        );
                      })}
                      {filteredProjects.length === 0 && (
                        <tr>
                          <td colSpan="7"><p className="empty">No projects match this view.</p></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedProject && <div className="admin-public-link"><Link2 size={16} /> {window.location.origin}{selectedProject.publicUrl}</div>}

              {editing && (
                <ProjectEditor
                  project={editing}
                  onChange={setEditing}
                  onCancel={() => setEditing(null)}
                  onSave={saveProject}
                />
              )}
            </>
          )}

          {canAccessAdminSection('projectWorkspace') && activeAdminSection === 'projectWorkspace' && selectedProject && (
            <section className="project-workspace">
              <div className="project-workspace-header">
                <div>
                  <button className="back-link" onClick={() => openAdminSection('projects')}>Back to projects</button>
                  <h2>{selectedProject.name}</h2>
                  <p>{selectedProject.description || 'No project description added yet.'}</p>
                </div>
                <div className="project-workspace-actions">
                  <button className="secondary compact-button" onClick={refreshAdminData} disabled={loading}>
                    <RefreshCw size={15} /> {loading ? 'Refreshing...' : 'Refresh data'}
                  </button>
                  <span className={`project-status ${selectedProjectStatus}`}>{selectedProjectStatus}</span>
                </div>
              </div>

              <div className="project-tabs" role="tablist" aria-label="Project workspace">
                {(isSurveyDesignerMode
                  ? [['form', 'Survey Designer']]
                  : [
                    ['summary', 'Summary'],
                    ['form', 'Form'],
                    ['data', 'Data'],
                    ['settings', 'Settings']
                  ]).map(([tab, label]) => (
                  <button
                    className={projectWorkspaceTab === tab ? 'active' : ''}
                    key={tab}
                    onClick={() => {
                      setProjectWorkspaceTab(tab);
                      setEditing(null);
                      setEditingResponse(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {projectWorkspaceTab === 'summary' && (
                <div className="project-summary-grid">
                  <div className="project-info-card">
                    <div className="section-title">
                      <h2>Project information</h2>
                      <button className="secondary compact-button" onClick={() => setProjectWorkspaceTab('settings')}><Pencil size={15} /> Edit details</button>
                    </div>
                    <div className="project-info-row span-2">
                      <span>Description</span>
                      <strong>{selectedProject.description || 'No description added'}</strong>
                    </div>
                    <div className="project-info-row">
                      <span>Status</span>
                      <strong><span className={`project-status ${selectedProjectStatus}`}>{selectedProjectStatus}</span></strong>
                    </div>
                    <div className="project-info-row">
                      <span>Questions</span>
                      <strong>{selectedProjectQuestions}</strong>
                    </div>
                    <div className="project-info-row">
                      <span>Owner</span>
                      <strong>admin</strong>
                    </div>
                    <div className="project-info-row">
                      <span>Last modified</span>
                      <strong>{formatProjectDate(selectedProject.updatedAt)}</strong>
                    </div>
                    <div className="project-info-row">
                      <span>Date deployed</span>
                      <strong>{selectedProject.isActive ? formatProjectDate(selectedProject.createdAt) : '-'}</strong>
                    </div>
                    <div className="project-info-row">
                      <span>Latest submission</span>
                      <strong>{selectedProjectLatest}</strong>
                    </div>
                  </div>

                  <div className="quick-link-stack">
                    <h2>Quick Links</h2>
                    <button onClick={() => window.open(selectedProject.publicUrl, '_blank')}><ClipboardList size={19} /> Collect data <ExternalLink size={17} /></button>
                    <button onClick={copyPublicLink}><Share2 size={19} /> Copy survey link <Copy size={17} /></button>
                    <button onClick={() => { setProjectWorkspaceTab('form'); editProject(selectedProject); }}><Pencil size={19} /> Edit form <ExternalLink size={17} /></button>
                    <button onClick={() => window.open(selectedProject.publicUrl, '_blank')}><Eye size={19} /> Preview form <ExternalLink size={17} /></button>
                  </div>

                  <div className="summary-submissions span-2">
                    <SummaryPerformance data={data} />
                  </div>
                </div>
              )}

              {projectWorkspaceTab === 'form' && (
                <div className={`project-form-workspace ${isSurveyDesignerMode ? 'designer-direct-workspace' : ''}`}>
                  {!isSurveyDesignerMode && (
                    <>
                      <div className="form-version-card">
                        <div>
                          <h2>Current version</h2>
                          <p><strong>v1</strong> Last modified: {formatProjectDate(selectedProject.updatedAt)} · {selectedProjectQuestions} questions</p>
                        </div>
                        <button className="primary" onClick={() => editProject(selectedProject)}><Pencil size={18} /> Edit Form</button>
                      </div>
                      <div className="collect-card">
                        <div>
                          <h2>Collect data</h2>
                          <p>Online and offline-enabled public survey link for field data collection.</p>
                        </div>
                        <div className="collect-actions">
                          <button className="secondary" onClick={copyPublicLink}><Copy size={17} /> Copy</button>
                          <button className="primary" onClick={() => window.open(selectedProject.publicUrl, '_blank')}><ExternalLink size={17} /> Open</button>
                        </div>
                      </div>
                      <label className="check-row form-access-row">
                        <input type="checkbox" checked readOnly />
                        Allow submissions to this form without username and password
                      </label>
                    </>
                  )}
                  {(editing || isSurveyDesignerMode) && (
                    <ProjectEditor
                      project={editing || projectToEditingDraft(selectedProject)}
                      onChange={setEditing}
                      onCancel={() => isSurveyDesignerMode ? openAdminSection('projects') : setEditing(null)}
                      onSave={saveProject}
                    />
                  )}
                </div>
              )}

              {projectWorkspaceTab === 'data' && (
                <div className="project-data-layout">
                  <nav className="project-data-nav" aria-label="Data sections">
                    {[
                      ['table', 'Table', <Table2 size={21} />],
                      ['reports', 'Reports', <BarChart3 size={21} />],
                      ['gallery', 'Gallery', <ImageIcon size={21} />],
                      ['downloads', 'Downloads', <Download size={21} />],
                      ['cleanup', 'Cleanup', <Trash2 size={21} />],
                      ['map', 'Map', <MapPin size={21} />]
                    ].map(([tab, label, icon]) => (
                      <button className={projectDataTab === tab ? 'active' : ''} key={tab} onClick={() => setProjectDataTab(tab)}>
                        {icon}{label}
                      </button>
                    ))}
                  </nav>

                  <div className="project-data-content">
                    {projectDataTab === 'table' && (
                      <>
                        <div className="panel filters admin-filters">
                          <label>
                            <span>Enumerator</span>
                            <select value={filters.enumerator} onChange={(event) => setFilters({ ...filters, enumerator: event.target.value })}>
                              <option value="">All enumerators</option>
                              {filterOptions.enumerators.map((enumerator) => <option key={enumerator}>{enumerator}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>Location</span>
                            <select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}>
                              <option value="">All locations</option>
                              {filterOptions.locations.map((location) => <option key={location}>{location}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>Date from</span>
                            <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
                          </label>
                          <label>
                            <span>Date to</span>
                            <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
                          </label>
                          <div className="filter-actions">
                            <button className="primary" onClick={() => setAppliedFilters(filters)}><Search size={18} /> Search</button>
                            <button className="secondary compact-button" onClick={refreshAdminData} disabled={loading}>
                              <RefreshCw size={15} /> {loading ? 'Refreshing...' : 'Refresh data'}
                            </button>
                          </div>
                        </div>
                        <RecentTable rows={data?.recent || []} project={selectedProject} loading={loading} onView={(responseId) => openResponse(responseId, 'view')} onEdit={(responseId) => openResponse(responseId, 'edit')} />
                      </>
                    )}

                    {projectDataTab === 'reports' && (
                      <div className="reports-workspace">
                        <ProjectReport project={selectedProject} data={data} />
                      </div>
                    )}

                    {projectDataTab === 'gallery' && (
                      <div className="panel empty-state-panel">
                        <ImageIcon size={34} />
                        <h2>Gallery</h2>
                        <p>Media uploads are not enabled for this Phase 1 survey. Future projects with photos or audio can review files here.</p>
                      </div>
                    )}

                    {projectDataTab === 'downloads' && (
                      <div className="downloads-workspace">
                        <div className="download-builder panel">
                          <div className="download-builder-head">
                            <div>
                              <h2>Downloads</h2>
                              <p>Export filtered project responses, GPS files, and analysis-ready workbooks.</p>
                            </div>
                            <button className="download export-primary" onClick={handleExportSubmit}><Download size={17} /> Export</button>
                          </div>
                          <div className="download-options-grid">
                            <label className="field-label">
                              Select export type
                              <select value={exportType} onChange={(event) => setExportType(event.target.value)}>
                                {exportTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                                <option disabled>SPSS labels (Phase 2)</option>
                                <option disabled>Media attachments ZIP (Phase 2)</option>
                              </select>
                            </label>
                            <label className="field-label">
                              Value and header format
                              <select value={exportHeaderFormat} onChange={(event) => setExportHeaderFormat(event.target.value)}>
                                <option value="labels">Labels</option>
                                <option value="raw">Field keys / raw headers</option>
                              </select>
                            </label>
                          </div>
                          <button className="link-button advanced-export-toggle" onClick={() => setAdvancedExportsOpen((open) => !open)}>
                            Advanced options {advancedExportsOpen ? 'hide' : 'show'}
                          </button>
                          {advancedExportsOpen && (
                            <div className="advanced-export-panel">
                              <label className="check-row">
                                <input type="checkbox" checked readOnly />
                                Apply current table filters to export
                              </label>
                              <label className="check-row">
                                <input type="checkbox" checked={exportType === 'xlsx'} readOnly />
                                Include Departures and Arrivals sheets for Excel
                              </label>
                              <label className="check-row muted">
                                <input type="checkbox" disabled />
                                Include media attachments when enabled for future projects
                              </label>
                            </div>
                          )}
                          <div className="quick-export-row">
                            <button className="secondary compact-button" onClick={() => download('xlsx')}><Download size={15} /> XLSX</button>
                            <button className="secondary compact-button" onClick={() => download('csv')}><Download size={15} /> CSV</button>
                            <button className="secondary compact-button" onClick={() => download('geojson')}><Download size={15} /> GeoJSON</button>
                            <button className="secondary compact-button" onClick={() => download('kml')}><Download size={15} /> KML</button>
                          </div>
                        </div>
                        <div className="panel exports-table">
                          <div className="section-title">
                            <h2>Exports</h2>
                            <p>Ready-to-download export formats for the current filters</p>
                          </div>
                          <div className="table-scroll">
                            <table>
                              <thead>
                                <tr><th>Type</th><th>Created</th><th>Format</th><th>Include groups</th><th>Action</th></tr>
                              </thead>
                              <tbody>
                                {exportHistory.map((row) => (
                                  <tr key={row.value}>
                                    <td>{row.label}</td>
                                    <td>On demand</td>
                                    <td>{['xlsx', 'csv'].includes(row.value) ? (exportHeaderFormat === 'raw' ? 'Field keys' : 'Labels') : row.format}</td>
                                    <td>{row.groups}</td>
                                    <td><button className="secondary compact-button" onClick={() => download(row.value)}><Download size={15} /> Download</button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {projectDataTab === 'cleanup' && (
                      <div className="cleanup-workspace">
                        <div className="panel cleanup-panel">
                          <div className="cleanup-copy">
                            <p className="eyebrow">Pilot cleanup</p>
                            <h2>Clear submitted data</h2>
                            <p>
                              Use this only when pilot or test submissions need to be removed before live fieldwork.
                              The system keeps a private server backup for 7 days before it expires.
                            </p>
                          </div>
                          <div className="cleanup-stats">
                            <div>
                              <span>Current samples</span>
                              <strong>{formatStatNumber(data?.totals?.total_samples || selectedProject.responseCount || 0)}</strong>
                            </div>
                            <div>
                              <span>Backup retention</span>
                              <strong>7 days</strong>
                            </div>
                          </div>
                          <button className="danger-button cleanup-danger-button" onClick={openClearDataModal}>
                            <Trash2 size={17} /> Clear submitted data
                          </button>
                        </div>

                        <div className="panel cleanup-backups-panel">
                          <div className="section-title">
                            <h2>Recent cleanup backups</h2>
                            <button className="secondary compact-button" onClick={() => loadClearDataBackups()}><RefreshCw size={15} /> Refresh</button>
                          </div>
                          {clearDataBackups.length > 0 ? (
                            <div className="table-scroll">
                              <table>
                                <thead>
                                  <tr><th>Backup ID</th><th>Responses</th><th>Created</th><th>Status</th><th>Action</th></tr>
                                </thead>
                                <tbody>
                                  {clearDataBackups.map((backup) => (
                                    <tr key={backup.id}>
                                      <td>#{backup.id}</td>
                                      <td>{formatStatNumber(backup.responseCount || 0)}</td>
                                      <td>{formatProjectDateTime(backup.createdAt)}</td>
                                      <td>
                                        {backup.restoredAt
                                          ? `Restored ${formatProjectDateTime(backup.restoredAt)}`
                                          : `Expires ${formatProjectDateTime(backup.expiresAt)}`}
                                      </td>
                                      <td>
                                        <button
                                          className="secondary compact-button"
                                          disabled={Boolean(backup.restoredAt)}
                                          onClick={() => openRestoreBackupModal(backup)}
                                        >
                                          <RefreshCw size={15} /> Restore
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="empty">No cleanup backups for this project yet.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {projectDataTab === 'map' && (
                      <div className="map-workspace">
                        <SurveyCoordinateMap rows={data?.mapRows || []} totalSamples={data?.totals?.total_samples ?? 0} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {projectWorkspaceTab === 'settings' && (
                <div className="settings-layout">
                  <nav className="settings-nav" aria-label="Project settings sections">
                    {settingsSections.map(([tab, label, icon]) => (
                      <button className={projectSettingsTab === tab ? 'active' : ''} key={tab} onClick={() => setProjectSettingsTab(tab)}>
                        {icon}{label}
                      </button>
                    ))}
                  </nav>
                  <div className="settings-content panel">
                    {projectSettingsTab === 'general' && (
                      <div className="settings-general-page">
                        <div className="settings-general-toolbar">
                          <button className="primary" onClick={saveGeneralSettings}><Save size={18} /> Save Changes</button>
                        </div>

                        <div className="settings-general-form">
                          <label>
                            Project Name <span>(required)</span>
                            <input value={generalDraft.name} onChange={(event) => setGeneralDraft({ ...generalDraft, name: event.target.value })} />
                          </label>
                          <label>
                            Description
                            <input value={generalDraft.description} onChange={(event) => setGeneralDraft({ ...generalDraft, description: event.target.value })} />
                          </label>
                          <div className="settings-two-column">
                            <label>
                              Sector <span>(required)</span>
                              <select value={generalDraft.sector} onChange={(event) => setGeneralDraft({ ...generalDraft, sector: event.target.value })}>
                                <option>Other</option>
                                <option>Transport</option>
                                <option>Infrastructure</option>
                                <option>Airport / Aviation</option>
                                <option>Urban Mobility</option>
                                <option>Research</option>
                              </select>
                            </label>
                            <label>
                              Country <span>(required)</span>
                              <select value={generalDraft.country} onChange={(event) => setGeneralDraft({ ...generalDraft, country: event.target.value })}>
                                <option>India</option>
                                <option>Other</option>
                              </select>
                            </label>
                          </div>
                        </div>

                        <div className="settings-danger-zone">
                          <button className="secondary" disabled={selectedProjectStatus === 'archived'} onClick={archiveSelectedProject}>
                            {selectedProjectStatus === 'archived' ? 'Project Archived' : 'Archive Project'}
                          </button>
                          <p>Archive project to stop accepting submissions.</p>
                          <button className="danger-button" onClick={() => setStatus('Delete workflow is not enabled for pilot safety.')}>Delete Project and Data</button>
                        </div>
                      </div>
                    )}
                    {projectSettingsTab !== 'general' && (
                      <div className="empty-state-panel">
                        <ShieldCheck size={34} />
                        <h2>{settingsSections.find(([tab]) => tab === projectSettingsTab)?.[1] || 'Project'} settings</h2>
                        <p>This area is reserved for the next phase of project controls.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}


          {canAccessAdminSection('organisation') && activeAdminSection === 'organisation' && (
            <OrganisationContextPanel
              foundation={foundation}
              draft={organisationDraft}
              onChange={setOrganisationDraft}
              onSave={saveOrganisationContext}
            />
          )}

          {canAccessAdminSection('users') && activeAdminSection === 'users' && (
            <UserManagementPanel
              users={users}
              roles={foundation.roles}
              permissions={foundation.permissions}
              projects={projects}
              bulkUserText={bulkUserText}
              bulkUserWorking={bulkUserWorking}
              onBulkUserTextChange={setBulkUserText}
              onBulkCreate={bulkCreateUsers}
              editingUser={editingUser}
              onStartNew={startNewUser}
              onEdit={editUser}
              onChange={setEditingUser}
              onCancel={() => setEditingUser(null)}
              onSave={saveUserAccess}
            />
          )}

          {canAccessAdminSection('clients') && activeAdminSection === 'clients' && (
            <section id="client-access">
              <AdminSectionErrorBoundary
                resetKey={`clients-${Array.isArray(clients) ? clients.length : 'x'}-${Array.isArray(recoveryRequests) ? recoveryRequests.length : 'x'}-${editingClient?.id || 'none'}`}
                onBack={() => openAdminSection('projects')}
              >
                <ClientAccessManager
                  clients={clients}
                  projects={projects}
                  editingClient={editingClient}
                  recoveryRequests={recoveryRequests}
                  onStartNew={startNewClient}
                  onEdit={editClient}
                  onChange={setEditingClient}
                  onCancel={() => setEditingClient(null)}
                  onSave={saveClient}
                  onResolveRecovery={resolveRecoveryRequest}
                />
              </AdminSectionErrorBoundary>
            </section>
          )}

          {canAccessAdminSection('vendors') && activeAdminSection === 'vendors' && (
            <VendorManagementPanel
              vendors={vendors}
              projects={projects}
              editingVendor={editingVendor}
              onStartNew={startNewVendor}
              onEdit={editVendor}
              onChange={setEditingVendor}
              onCancel={() => setEditingVendor(null)}
              onSave={saveVendorAccess}
            />
          )}

          {canAccessAdminSection('library') && activeAdminSection === 'library' && (
            <PortfolioDashboard
              clients={clients}
              clientProjectRows={clientProjectRows}
              data={data}
              download={download}
              filterOptions={filterOptions}
              filters={filters}
              loading={loading}
              loadDashboard={refreshAdminData}
              projects={projects}
              setAppliedFilters={setAppliedFilters}
              setFilters={setFilters}
              totalProjectSubmissions={totalProjectSubmissions}
            />
          )}


          {editingResponse && (
            <ResponseEditor
              response={editingResponse}
              mode={responseMode}
              project={selectedProject}
              onChange={setEditingResponse}
              onCancel={() => setEditingResponse(null)}
              onSave={saveResponse}
              onDownloadAudio={downloadAudio}
              audioPreview={audioPreview}
            />
          )}
          {clearDataModalOpen && selectedProject && (
            <div className="modal-backdrop cleanup-modal-backdrop" role="presentation">
              <div className="cleanup-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="clear-data-title">
                <div className="cleanup-confirm-head">
                  <div>
                    <p className="eyebrow">Confirm cleanup</p>
                    <h2 id="clear-data-title">Clear submitted data?</h2>
                  </div>
                  <button className="icon-button" onClick={() => setClearDataModalOpen(false)} aria-label="Close cleanup confirmation">
                    <X size={18} />
                  </button>
                </div>
                <p>
                  This will remove all submitted responses for <strong>{selectedProject.name}</strong>.
                  A server backup will be retained for 7 days for recovery if this was done by mistake.
                </p>
                <div className="cleanup-confirm-summary">
                  <span>Responses to clear</span>
                  <strong>{formatStatNumber(data?.totals?.total_samples || selectedProject.responseCount || 0)}</strong>
                </div>
                <label className="field-label">
                  Type CLEAR DATA to confirm
                  <input
                    autoFocus
                    value={clearDataConfirmation}
                    onChange={(event) => setClearDataConfirmation(event.target.value)}
                    placeholder="CLEAR DATA"
                  />
                </label>
                <div className="modal-actions">
                  <button className="secondary" onClick={() => setClearDataModalOpen(false)}>Cancel</button>
                  <button
                    className="danger-button"
                    disabled={clearDataConfirmation.trim() !== 'CLEAR DATA' || clearDataWorking}
                    onClick={clearProjectResponses}
                  >
                    <Trash2 size={16} /> {clearDataWorking ? 'Clearing...' : 'Clear data'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {restoreBackupTarget && selectedProject && (
            <div className="modal-backdrop cleanup-modal-backdrop" role="presentation">
              <div className="cleanup-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="restore-data-title">
                <div className="cleanup-confirm-head">
                  <div>
                    <p className="eyebrow">Confirm restore</p>
                    <h2 id="restore-data-title">Restore backup #{restoreBackupTarget.id}?</h2>
                  </div>
                  <button className="icon-button" onClick={() => setRestoreBackupTarget(null)} aria-label="Close restore confirmation">
                    <X size={18} />
                  </button>
                </div>
                <p>
                  This will add the backed-up responses back into <strong>{selectedProject.name}</strong>.
                  A backup can be restored only once to prevent accidental duplicates.
                </p>
                <div className="cleanup-confirm-summary restore-summary">
                  <span>Responses in backup</span>
                  <strong>{formatStatNumber(restoreBackupTarget.responseCount || 0)}</strong>
                </div>
                <label className="field-label">
                  Type RESTORE DATA to confirm
                  <input
                    autoFocus
                    value={restoreDataConfirmation}
                    onChange={(event) => setRestoreDataConfirmation(event.target.value)}
                    placeholder="RESTORE DATA"
                  />
                </label>
                <div className="modal-actions">
                  <button className="secondary" onClick={() => setRestoreBackupTarget(null)}>Cancel</button>
                  <button
                    className="primary"
                    disabled={restoreDataConfirmation.trim() !== 'RESTORE DATA' || restoreDataWorking}
                    onClick={restoreBackupResponses}
                  >
                    <RefreshCw size={16} /> {restoreDataWorking ? 'Restoring...' : 'Restore backup'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {status && <p className="status success">{status}</p>}
        </div>
      </div>
    </section>
  );
}

function SurveyCoordinateMap({ rows, totalSamples }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markerLayerRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const [baseLayer, setBaseLayer] = useState('osm');
  const [mapMode, setMapMode] = useState('points');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('overlays');
  const [palette, setPalette] = useState('vtrac');
  const [colorBy, setColorBy] = useState('location');
  const [fullscreen, setFullscreen] = useState(false);
  const [overlayName, setOverlayName] = useState('');
  const [overlayFile, setOverlayFile] = useState(null);
  const [overlayMessage, setOverlayMessage] = useState('');
  const points = useMemo(() => (
    (rows || [])
      .map((row) => ({
        ...row,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude)
      }))
      .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
  ), [rows]);
  const latest = points[0];
  const coverage = totalSamples ? Math.round((points.length / totalSamples) * 100) : 0;
  const paletteColors = markerPalettes[palette] || markerPalettes.vtrac;
  const groupColorMap = useMemo(() => {
    const values = [...new Set(points.map((point) => mapGroupValue(point, colorBy)))];
    return Object.fromEntries(values.map((value, index) => [value, paletteColors[index % paletteColors.length]]));
  }, [points, colorBy, paletteColors]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return undefined;
    const map = L.map(mapRef.current, {
      center: [12.9716, 77.5946],
      zoom: 11,
      scrollWheelZoom: false
    });
    markerLayerRef.current = L.layerGroup().addTo(map);
    overlayLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    setTimeout(() => map.invalidateSize(), 80);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      markerLayerRef.current = null;
      overlayLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const layer = mapBaseLayers[baseLayer] || mapBaseLayers.osm;
    tileLayerRef.current = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: layer.maxZoom
    }).addTo(map);
  }, [baseLayer]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const markerLayer = markerLayerRef.current;
    if (!map || !markerLayer) return;

    markerLayer.clearLayers();
    const visiblePoints = points.slice(0, 1200);
    const bounds = [];
    visiblePoints.forEach((point, index) => {
      const latLng = [point.latitude, point.longitude];
      const groupValue = mapGroupValue(point, colorBy);
      const markerColor = groupColorMap[groupValue] || '#0aa7a4';
      bounds.push(latLng);
      const marker = L.circleMarker(latLng, {
        radius: mapMode === 'heat' ? 22 : index < 100 ? 6 : 4.5,
        color: mapMode === 'heat' ? markerColor : '#ffffff',
        opacity: mapMode === 'heat' ? 0.16 : 1,
        weight: mapMode === 'heat' ? 0 : 1.5,
        fillColor: markerColor,
        fillOpacity: mapMode === 'heat' ? 0.2 : 0.74
      });
      marker
        .bindPopup(`
          <strong>${escapeHtml(point.enumerator_name || 'Enumerator')}</strong><br />
          ${escapeHtml(point.location || 'Location')}<br />
          Group: ${escapeHtml(groupValue)}<br />
          ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}
        `)
        .addTo(markerLayer);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else {
      map.setView([12.9716, 77.5946], 11);
    }
    setTimeout(() => map.invalidateSize(), 80);
  }, [points, mapMode, colorBy, groupColorMap]);

  useEffect(() => {
    setTimeout(() => mapInstanceRef.current?.invalidateSize(), 160);
  }, [fullscreen]);

  async function uploadOverlay() {
    const map = mapInstanceRef.current;
    const overlayLayer = overlayLayerRef.current;
    if (!map || !overlayLayer || !overlayFile) return;
    setOverlayMessage('');
    const text = await overlayFile.text();
    const name = overlayName.trim() || overlayFile.name;
    try {
      if (overlayFile.name.toLowerCase().endsWith('.geojson') || overlayFile.name.toLowerCase().endsWith('.json')) {
        const geoJson = JSON.parse(text);
        const layer = L.geoJSON(geoJson, {
          style: { color: '#133e98', weight: 2, fillColor: '#0aa7a4', fillOpacity: 0.18 },
          pointToLayer: (_feature, latLng) => L.circleMarker(latLng, { radius: 7, color: '#ffffff', weight: 1, fillColor: '#e0a12f', fillOpacity: 0.85 })
        }).bindPopup(name);
        layer.addTo(overlayLayer);
        map.fitBounds(layer.getBounds(), { padding: [26, 26], maxZoom: 13 });
        setOverlayMessage(`${name} added as a map overlay.`);
        return;
      }

      if (overlayFile.name.toLowerCase().endsWith('.csv')) {
        const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
        const headers = headerLine.split(',').map((item) => item.trim().toLowerCase());
        const latIndex = headers.findIndex((item) => ['lat', 'latitude'].includes(item));
        const lngIndex = headers.findIndex((item) => ['lng', 'lon', 'long', 'longitude'].includes(item));
        if (latIndex === -1 || lngIndex === -1) throw new Error('CSV requires latitude and longitude columns.');
        const bounds = [];
        lines.slice(0, 1500).forEach((line) => {
          const cells = line.split(',');
          const latitude = Number(cells[latIndex]);
          const longitude = Number(cells[lngIndex]);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          bounds.push([latitude, longitude]);
          L.circleMarker([latitude, longitude], { radius: 5, color: '#ffffff', weight: 1, fillColor: '#e0a12f', fillOpacity: 0.82 }).bindPopup(name).addTo(overlayLayer);
        });
        if (bounds.length) map.fitBounds(bounds, { padding: [26, 26], maxZoom: 13 });
        setOverlayMessage(`${bounds.length} overlay points added from ${name}.`);
        return;
      }

      setOverlayMessage('Please upload GeoJSON or CSV overlays. KML/KMZ overlay parsing can be added in the next GIS phase.');
    } catch (error) {
      setOverlayMessage(error.message || 'Unable to load overlay.');
    }
  }

  return (
    <div className={`panel coordinate-map-panel ${fullscreen ? 'fullscreen-map' : ''}`}>
      <div className="coordinate-map-head">
        <div>
          <p className="eyebrow">GPS Layer</p>
          <h2><MapPin size={19} /> OpenStreetMap GPS view</h2>
          <p>Interactive OpenStreetMap layer using submitted latitude and longitude points for spatial review.</p>
        </div>
        <div className="coordinate-map-stats">
          <ReportKpi label="GPS samples" value={points.length} />
          <ReportKpi label="Coverage" value={`${coverage}%`} />
          <ReportKpi label="Total samples" value={totalSamples} />
        </div>
      </div>

      <div className="coordinate-map-canvas">
        <div className="osm-map" ref={mapRef} />
        <div className="map-control-stack">
          <button className="map-icon-button" title="Map settings" onClick={() => setSettingsOpen(true)}><Settings size={20} /></button>
          <button className="map-icon-button" title="Toggle layers" onClick={() => setShowLayerPicker((open) => !open)}><Layers size={20} /></button>
          <button className="map-icon-button" title="Toggle fullscreen" onClick={() => setFullscreen((active) => !active)}><Maximize2 size={20} /></button>
          <button className={`map-icon-button ${mapMode === 'points' ? 'active' : ''}`} title="Show as points" onClick={() => setMapMode('points')}><MapPin size={20} /></button>
          <button className={`map-icon-button ${mapMode === 'heat' ? 'active' : ''}`} title="Show as heatmap" onClick={() => setMapMode('heat')}><Flame size={20} /></button>
        </div>
        {showLayerPicker && (
          <div className="map-layer-popover">
            {Object.entries(mapBaseLayers).map(([key, layer]) => (
              <label key={key}>
                <input type="radio" checked={baseLayer === key} onChange={() => setBaseLayer(key)} />
                {layer.label}
              </label>
            ))}
          </div>
        )}
        <label className="map-disaggregate">
          <span>Disaggregate by</span>
          <select value={colorBy} onChange={(event) => setColorBy(event.target.value)}>
            <option value="location">Survey location</option>
            <option value="enumerator">Enumerator</option>
            <option value="terminal">Terminal</option>
            <option value="movement">Movement</option>
          </select>
        </label>
        {settingsOpen && (
          <div className="map-settings-backdrop">
            <div className="map-settings-modal">
              <div className="map-settings-header">
                <h3>Map Settings</h3>
                <button onClick={() => setSettingsOpen(false)}><X size={22} /></button>
              </div>
              <div className="map-settings-tabs">
                <button className={settingsTab === 'overlays' ? 'active' : ''} onClick={() => setSettingsTab('overlays')}>Overlays</button>
                <button className={settingsTab === 'colors' ? 'active' : ''} onClick={() => setSettingsTab('colors')}>Marker colors</button>
              </div>
              {settingsTab === 'overlays' ? (
                <div className="map-settings-body">
                  <p>Upload a GeoJSON or CSV file with latitude and longitude columns to view it as a temporary overlay on this map.</p>
                  <div className="overlay-upload-row">
                    <input value={overlayName} onChange={(event) => setOverlayName(event.target.value)} placeholder="Layer name" />
                    <input type="file" accept=".geojson,.json,.csv,.kml,.kmz" onChange={(event) => setOverlayFile(event.target.files?.[0] || null)} />
                    <button className="download" onClick={uploadOverlay} disabled={!overlayFile}><Upload size={16} /> Upload</button>
                  </div>
                  {overlayMessage && <p className="overlay-message">{overlayMessage}</p>}
                </div>
              ) : (
                <div className="map-settings-body">
                  <p>Choose a marker palette for the selected disaggregation.</p>
                  {Object.entries(markerPalettes).map(([key, colors]) => (
                    <label className="palette-row" key={key}>
                      <input type="radio" checked={palette === key} onChange={() => setPalette(key)} />
                      <span>{key === 'vtrac' ? 'VTRAC brand' : key}</span>
                      <span className="palette-swatches">
                        {colors.map((color) => <i key={color} style={{ background: color }} />)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {points.length === 0 && (
          <div className="empty-state-panel map-empty map-empty-overlay">
            <MapPin size={34} />
            <h2>No GPS coordinates yet</h2>
            <p>Once latitude and longitude exist in submitted records, points will appear here.</p>
          </div>
        )}
      </div>

      <div className="coordinate-map-foot">
        <span>OpenStreetMap base layer with VTRAC survey GPS points</span>
        {latest && <strong>Latest: {Number(latest.latitude).toFixed(5)}, {Number(latest.longitude).toFixed(5)}</strong>}
      </div>
    </div>
  );
}

function mapGroupValue(point, colorBy) {
  const location = point.location || 'Unassigned';
  if (colorBy === 'enumerator') return point.enumerator_name || 'Unassigned';
  if (colorBy === 'terminal') {
    if (location.includes('Terminal 1')) return 'Terminal 1';
    if (location.includes('Terminal 2')) return 'Terminal 2';
    return 'Unassigned terminal';
  }
  if (colorBy === 'movement') {
    if (location.includes('Departures')) return 'Departures';
    if (location.includes('Arrivals')) return 'Arrivals';
    return 'Unassigned movement';
  }
  return location;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ProjectEditor({ project, onChange, onCancel, onSave }) {
  const settings = normalizeSurveySettings(project.settings, project.slug);
  const questions = Array.isArray(project.questions) ? project.questions : [];
  const [studioTab, setStudioTab] = useState('builder');
  const [propertiesTab, setPropertiesTab] = useState('properties');
  const [questionSearch, setQuestionSearch] = useState('');
  const [activeSection, setActiveSection] = useState('Vehicle Ownership');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [draggedQuestionIndex, setDraggedQuestionIndex] = useState(null);
  const selectedIndex = questions.length ? Math.min(selectedQuestionIndex, questions.length - 1) : -1;
  const selectedQuestion = selectedIndex >= 0 ? questions[selectedIndex] : null;

  function update(field, value) {
    onChange({ ...project, [field]: value });
  }

  function updateSetting(field, value) {
    onChange({ ...project, settings: { ...settings, [field]: value } });
  }

  function updateComponentPolicy(field, value) {
    const componentPolicy = {
      ...settings.componentPolicy,
      [field]: normalizeComponentMode(value)
    };
    onChange({ ...project, settings: withComponentPolicy(settings, componentPolicy) });
  }

  function updateQuestion(index, field, value) {
    const nextQuestions = [...questions];
    nextQuestions[index] = { ...nextQuestions[index], [field]: value };
    onChange({ ...project, questions: nextQuestions });
  }

  function patchQuestion(index, patch) {
    const nextQuestions = [...questions];
    nextQuestions[index] = { ...nextQuestions[index], ...patch };
    onChange({ ...project, questions: nextQuestions });
  }

  function addQuestion() {
    addQuestionFromBank({
      label: 'Short Text',
      type: 'text',
      templateLabel: 'New question'
    });
  }

  function removeQuestion(index) {
    const nextQuestions = questions.filter((_, currentIndex) => currentIndex !== index);
    onChange({ ...project, questions: nextQuestions });
    setSelectedQuestionIndex(Math.max(0, Math.min(index, nextQuestions.length - 1)));
  }

  function moveQuestion(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    const nextQuestions = [...questions];
    [nextQuestions[index], nextQuestions[nextIndex]] = [nextQuestions[nextIndex], nextQuestions[index]];
    onChange({ ...project, questions: nextQuestions });
    setSelectedQuestionIndex(nextIndex);
  }

  function reorderQuestion(fromIndex, toIndex) {
    if (fromIndex === null || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const nextQuestions = [...questions];
    const [movedQuestion] = nextQuestions.splice(fromIndex, 1);
    nextQuestions.splice(toIndex, 0, movedQuestion);
    onChange({ ...project, questions: nextQuestions });
    setSelectedQuestionIndex(toIndex);
    setDraggedQuestionIndex(null);
  }

  function duplicateQuestion(index) {
    const source = questions[index];
    if (!source) return;
    const copiedQuestion = {
      ...source,
      id: `${source.id || variableFromLabel(source.label, index)}_copy_${questions.length + 1}`,
      label: `${source.label || 'Question'} copy`
    };
    const nextQuestions = [...questions];
    nextQuestions.splice(index + 1, 0, copiedQuestion);
    onChange({ ...project, questions: nextQuestions });
    setSelectedQuestionIndex(index + 1);
  }

  function variableFromLabel(label, index) {
    const base = String(label || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 34);
    return base || `q${index + 1}`;
  }

  function stableQuestionType(type) {
    if (type === 'long-text' || type === 'textarea' || type === 'consent') return 'textarea';
    if (['number', 'decimal', 'slider', 'rating', 'nps'].includes(type)) return 'number';
    if (['date', 'time'].includes(type)) return 'date';
    if (
      ['yes-no', 'single-choice', 'multiple-choice', 'dropdown', 'ranking', 'autocomplete', 'likert', 'matrix'].includes(type)
    ) {
      return 'select';
    }
    return 'text';
  }

  function defaultOptionsForType(type) {
    if (type === 'yes-no') return 'Yes\nNo';
    if (type === 'likert') return 'Strongly disagree\nDisagree\nNeutral\nAgree\nStrongly agree';
    if (type === 'rating') return '1\n2\n3\n4\n5';
    if (type === 'nps') return '0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10';
    if (type === 'single-choice' || type === 'multiple-choice' || type === 'dropdown') return 'Option 1\nOption 2\nOther';
    if (type === 'ranking') return 'First choice\nSecond choice\nThird choice';
    return '';
  }

  function questionTypeLabel(question) {
    const labels = {
      text: 'Short Text',
      textarea: 'Long Text',
      number: 'Number',
      date: 'Date',
      select: 'Choice'
    };
    return labels[question?.type] || 'Short Text';
  }

  function optionRowsFor(question) {
    const labels = String(question?.options || '')
      .split(/\r?\n/)
      .map((option) => option.trim())
      .filter(Boolean);
    return labels.map((label, index) => ({
      code: String(index + 1).padStart(2, '0'),
      label,
      exclusive: /other|none|refused|don't know/i.test(label)
    }));
  }

  function updateOptionLabel(optionIndex, value) {
    if (!selectedQuestion) return;
    const rows = optionRowsFor(selectedQuestion);
    rows[optionIndex] = { ...(rows[optionIndex] || {}), label: value };
    patchQuestion(selectedIndex, { options: rows.map((row) => row.label).filter(Boolean).join('\n') });
  }

  function addOption() {
    if (!selectedQuestion) return;
    const rows = optionRowsFor(selectedQuestion);
    rows.push({ code: String(rows.length + 1).padStart(2, '0'), label: `Option ${rows.length + 1}`, exclusive: false });
    patchQuestion(selectedIndex, { options: rows.map((row) => row.label).join('\n') });
  }

  function removeOption(optionIndex) {
    if (!selectedQuestion) return;
    const rows = optionRowsFor(selectedQuestion).filter((_, index) => index !== optionIndex);
    patchQuestion(selectedIndex, { options: rows.map((row) => row.label).join('\n') });
  }

  function addQuestionFromBank(item) {
    const nextIndex = questions.length;
    const label = item.templateLabel || item.label || 'New question';
    const nextQuestion = {
      ...blankQuestion,
      id: variableFromLabel(label, nextIndex),
      label,
      type: stableQuestionType(item.type),
      options: defaultOptionsForType(item.type),
      required: false
    };
    onChange({ ...project, questions: [...questions, nextQuestion] });
    setSelectedQuestionIndex(nextIndex);
    setActiveSection(activeSection || 'Draft Section');
  }

  const componentControls = [
    {
      key: 'gps',
      title: 'GPS coordinates',
      description: 'Capture latitude, longitude, and accuracy for field quality checks.'
    },
    {
      key: 'audio',
      title: 'Audio verification',
      description: 'Attach compressed browser audio when required for audit or QA.'
    },
    {
      key: 'respondentPhone',
      title: 'Respondent phone field',
      description: 'Show, require, or hide phone collection for callbacks and validation.'
    },
    {
      key: 'householdId',
      title: 'Household / sample ID',
      description: 'Use when a survey needs a unique household, respondent, or sample reference.'
    }
  ];
  const questionBankGroups = [
    {
      title: 'Basic',
      items: [
        { label: 'Short Text', type: 'text' },
        { label: 'Long Text', type: 'long-text' },
        { label: 'Number', type: 'number' },
        { label: 'Decimal', type: 'decimal' },
        { label: 'Date', type: 'date' },
        { label: 'Time', type: 'time' },
        { label: 'Yes / No', type: 'yes-no' }
      ]
    },
    {
      title: 'Choice',
      items: [
        { label: 'Single Choice', type: 'single-choice' },
        { label: 'Multiple Choice', type: 'multiple-choice' },
        { label: 'Dropdown', type: 'dropdown' },
        { label: 'Ranking', type: 'ranking' },
        { label: 'Autocomplete', type: 'autocomplete' }
      ]
    },
    {
      title: 'Scale',
      items: [
        { label: 'Likert', type: 'likert' },
        { label: 'Rating', type: 'rating' },
        { label: 'Slider', type: 'slider' },
        { label: 'Matrix', type: 'matrix' },
        { label: 'NPS', type: 'nps' }
      ]
    },
    {
      title: 'Field Survey',
      items: [
        { label: 'GPS Location', type: 'gps', templateLabel: 'Capture GPS location' },
        { label: 'Photo / Video', type: 'media', templateLabel: 'Attach media evidence' },
        { label: 'Audio', type: 'audio', templateLabel: 'Audio verification note' },
        { label: 'Signature', type: 'signature', templateLabel: 'Respondent signature' },
        { label: 'Barcode / QR', type: 'barcode', templateLabel: 'Scan barcode or QR code' },
        { label: 'File Upload', type: 'file', templateLabel: 'Upload supporting document' }
      ]
    },
    {
      title: 'Advanced',
      items: [
        { label: 'Repeating Group', type: 'roster', templateLabel: 'Roster details' },
        { label: 'Matrix', type: 'matrix', templateLabel: 'Matrix question' },
        { label: 'Calculated Field', type: 'calculated', templateLabel: 'Calculated value' },
        { label: 'Zone / Map', type: 'zone', templateLabel: 'Zone mapped location' },
        { label: 'Lookup', type: 'lookup', templateLabel: 'Lookup value' },
        { label: 'Consent', type: 'consent', templateLabel: 'Consent statement' }
      ]
    }
  ];
  const visibleQuestionBankGroups = questionBankGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(questionSearch.trim().toLowerCase()))
    }))
    .filter((group) => group.items.length > 0);
  const studioTabs = ['Builder', 'Logic', 'Quality Rules', 'Languages', 'Variables', 'Versions', 'Settings'];
  const propertyTabs = ['Properties', 'Logic', 'Validation', 'Quality'];
  const sectionTabs = [
    'Introduction & Consent',
    'Household',
    'Socio-Economic',
    'Vehicle Ownership',
    'Travel Behaviour',
    'Origin Destination',
    'Enumerator Observation'
  ];
  const surveyHealth = Math.min(98, Math.max(58, 70 + Math.round(questions.length * 1.8) + (questions.some((question) => question.required) ? 8 : 0)));
  const logicRuleCount = questions.filter((question) => question.type === 'select').length;
  const qualityRuleCount = componentControls.filter((component) => getComponentMode(settings, component.key) !== 'off').length;
  const estimatedMinutes = Math.max(4, Math.round(questions.length * 1.35));
  const optionRows = optionRowsFor(selectedQuestion);

  return (
    <div className="survey-studio-shell">
      <div className="survey-studio-header">
        <div>
          <button type="button" className="studio-back-button" onClick={onCancel}>Back to projects</button>
          <div className="studio-title-row">
            <h2>{project.name || 'Untitled Survey'}</h2>
            <span className="studio-version">v1.4</span>
            <span className="studio-status"><CheckCircle2 size={14} /> Draft</span>
            <span className="studio-save-state">Autosaved just now</span>
          </div>
          <p>{project.description || 'Build, validate, test, and publish a professional field survey.'}</p>
        </div>
        <div className="studio-header-actions">
          <span className="studio-avatar-stack"><span>NR</span><span>QA</span><span>+3</span></span>
          <button type="button" className="secondary"><Eye size={16} /> Preview</button>
          <button type="button" className="secondary"><Send size={16} /> Run Test</button>
          <button type="button" className="primary" onClick={() => onSave(project)}><Upload size={16} /> Publish</button>
          <button type="button" className="primary" onClick={() => onSave(project)}><Save size={16} /> Save</button>
        </div>
      </div>

      <div className="studio-top-tabs" role="tablist" aria-label="Survey Studio workflow tabs">
        {studioTabs.map((tab) => {
          const key = tab.toLowerCase().replaceAll(' ', '-');
          return (
            <button
              key={tab}
              type="button"
              className={studioTab === key ? 'active' : ''}
              onClick={() => setStudioTab(key)}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div className="studio-project-setup">
        <label>
          Project name
          <input value={project.name} onChange={(event) => update('name', event.target.value)} />
        </label>
        <label>
          URL slug
          <input value={project.slug} onChange={(event) => update('slug', event.target.value)} placeholder="example-survey" />
        </label>
        <label>
          Description
          <input value={project.description} onChange={(event) => update('description', event.target.value)} />
        </label>
        <label>
          Locations
          <textarea value={project.locations} onChange={(event) => update('locations', event.target.value)} />
        </label>
      </div>

      <div className="survey-studio-grid">
        <aside className="studio-question-bank">
          <div className="studio-panel-title">
            <ClipboardList size={18} />
            <span>Question Bank</span>
          </div>
          <label className="studio-search">
            <Search size={15} />
            <input value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} placeholder="Search question types..." />
          </label>
          <div className="studio-bank-groups">
            {visibleQuestionBankGroups.map((group) => (
              <div className="studio-bank-group" key={group.title}>
                <h3>{group.title}</h3>
                {group.items.map((item) => (
                  <button key={`${group.title}-${item.label}`} type="button" onClick={() => addQuestionFromBank(item)}>
                    <Plus size={14} />
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="studio-bank-actions">
            <button type="button" className="secondary" onClick={addQuestion}><Plus size={16} /> Custom Question</button>
            <button type="button" className="secondary"><Layers size={16} /> Question Library</button>
          </div>
        </aside>

        <main className="studio-canvas">
          <div className="studio-meta-grid">
            <div><strong>{questions.length}</strong><span>Total Questions</span></div>
            <div><strong>{sectionTabs.length}</strong><span>Sections</span></div>
            <div><strong>{logicRuleCount}</strong><span>Logic Rules</span></div>
            <div><strong>{qualityRuleCount}</strong><span>Quality Rules</span></div>
            <div><strong>4</strong><span>Languages</span></div>
            <div><strong>{estimatedMinutes}-{estimatedMinutes + 5} min</strong><span>Est. Duration</span></div>
            <div className="studio-health">
              <span style={{ '--health': `${surveyHealth}%` }}>{surveyHealth}</span>
              <small>Survey Health</small>
            </div>
          </div>

          <div className="studio-section-tabs" role="tablist" aria-label="Survey sections">
            {sectionTabs.map((section, index) => (
              <button
                key={section}
                type="button"
                className={activeSection === section ? 'active' : ''}
                onClick={() => setActiveSection(section)}
              >
                {index + 1}. {section}
              </button>
            ))}
            <button type="button" className="studio-more-button" title="More sections">...</button>
          </div>

          <section className="studio-section-card">
            <div className="studio-section-card-header">
              <div>
                <p className="eyebrow">Section {Math.max(1, sectionTabs.indexOf(activeSection) + 1)}</p>
                <h3>{activeSection}</h3>
                <span>Organise questions, response options, quality checks, and branching rules.</span>
              </div>
              <div className="studio-section-actions">
                <button type="button" className="secondary">Collapse</button>
                <button type="button" className="secondary"><Copy size={15} /> Duplicate</button>
                <button type="button" className="secondary"><Plus size={15} /> Add Section</button>
              </div>
            </div>

            {questions.length === 0 ? (
              <div className="studio-empty-canvas">
                <ClipboardList size={32} />
                <h3>Start building your survey</h3>
                <p>Add a question from the bank or create a custom question.</p>
                <button type="button" className="primary" onClick={addQuestion}><Plus size={16} /> Add first question</button>
              </div>
            ) : (
              <div className="studio-question-stack">
                {questions.map((question, index) => {
                  const isSelected = index === selectedIndex;
                  const rows = optionRowsFor(question).slice(0, 6);
                  return (
                    <article
                      key={`${question.id || 'question'}-${index}`}
                      className={`studio-question-card ${isSelected ? 'selected' : ''}`}
                      draggable
                      onDragStart={() => setDraggedQuestionIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => reorderQuestion(draggedQuestionIndex, index)}
                      onClick={() => setSelectedQuestionIndex(index)}
                    >
                      <div className="studio-question-card-header">
                        <span className="studio-drag-handle">::</span>
                        <strong>Q{index + 1}</strong>
                        <div>
                          <h4>{question.label || 'Untitled question'}</h4>
                          <p>{question.id || variableFromLabel(question.label, index)}</p>
                        </div>
                        <span className="studio-pill">{questionTypeLabel(question)}</span>
                        {question.required && <span className="studio-pill danger">Required</span>}
                        {question.type === 'select' && <span className="studio-pill blue">Logic ready</span>}
                        <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); duplicateQuestion(index); }} title="Duplicate question"><Copy size={15} /></button>
                        <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); removeQuestion(index); }} title="Delete question"><Trash2 size={15} /></button>
                      </div>

                      {question.type === 'select' && rows.length > 0 ? (
                        <div className="studio-option-preview">
                          {rows.map((row) => (
                            <span key={`${question.id}-${row.code}-${row.label}`}>
                              <i />
                              {row.label}
                            </span>
                          ))}
                        </div>
                      ) : question.type === 'textarea' ? (
                        <div className="studio-long-preview">Long text response area</div>
                      ) : question.type === 'number' ? (
                        <div className="studio-short-preview">Numeric answer</div>
                      ) : (
                        <div className="studio-short-preview">Short answer</div>
                      )}

                      <div className="studio-question-footer">
                        <span><ShieldCheck size={14} /> QA ready</span>
                        <span><Settings size={14} /> Validation optional</span>
                        <div>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={(event) => { event.stopPropagation(); moveQuestion(index, -1); }}
                            disabled={index === 0}
                            title="Move question up"
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={(event) => { event.stopPropagation(); moveQuestion(index, 1); }}
                            disabled={index === questions.length - 1}
                            title="Move question down"
                          >
                            <ArrowDown size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <button type="button" className="studio-add-question-line" onClick={addQuestion}><Plus size={16} /> Add Question</button>
          </section>
        </main>

        <aside className="studio-properties">
          <div className="studio-properties-tabs">
            {propertyTabs.map((tab) => (
              <button
                type="button"
                key={tab}
                className={propertiesTab === tab.toLowerCase() ? 'active' : ''}
                onClick={() => setPropertiesTab(tab.toLowerCase())}
              >
                {tab}
              </button>
            ))}
          </div>

          {selectedQuestion ? (
            <div className="studio-property-body">
              {propertiesTab === 'properties' && (
                <>
                  <div className="studio-panel-title">
                    <Settings size={18} />
                    <span>Question Properties</span>
                  </div>
                  <label>
                    Question Type
                    <select value={selectedQuestion.type} onChange={(event) => patchQuestion(selectedIndex, { type: event.target.value, options: event.target.value === 'select' ? selectedQuestion.options || 'Option 1\nOption 2' : '' })}>
                      <option value="text">Short Text</option>
                      <option value="textarea">Long Text</option>
                      <option value="select">Choice / Dropdown</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                    </select>
                  </label>
                  <label>
                    Question Text
                    <textarea value={selectedQuestion.label || ''} onChange={(event) => patchQuestion(selectedIndex, { label: event.target.value, id: variableFromLabel(event.target.value, selectedIndex) })} />
                  </label>
                  <label>
                    Enumerator Instruction
                    <textarea value={selectedQuestion.instruction || ''} onChange={(event) => updateQuestion(selectedIndex, 'instruction', event.target.value)} placeholder="Read out the options clearly, probe only where needed." />
                  </label>
                  <label>
                    Variable Name
                    <input value={selectedQuestion.id || ''} onChange={(event) => updateQuestion(selectedIndex, 'id', event.target.value)} />
                  </label>

                  {selectedQuestion.type === 'select' && (
                    <div className="studio-option-editor">
                      <div className="studio-option-editor-header">
                        <strong>Response Options</strong>
                        <button type="button" className="secondary" onClick={addOption}><Plus size={14} /> Add Option</button>
                      </div>
                      {optionRows.map((row, index) => (
                        <div className="studio-option-row" key={`${row.code}-${index}`}>
                          <span>{row.code}</span>
                          <input value={row.label} onChange={(event) => updateOptionLabel(index, event.target.value)} />
                          <button type="button" className="icon-button" onClick={() => removeOption(index)} title="Remove option"><Trash2 size={14} /></button>
                        </div>
                      ))}
                      <small>Codes are previewed for questionnaire design. Export-level value coding will be finalised in the data dictionary stage.</small>
                    </div>
                  )}

                  <div className="studio-toggle-list">
                    <label className="studio-toggle-row">
                      <span>Required</span>
                      <input type="checkbox" checked={Boolean(selectedQuestion.required)} onChange={(event) => updateQuestion(selectedIndex, 'required', event.target.checked)} />
                    </label>
                    <label className="studio-toggle-row">
                      <span>Randomise options</span>
                      <input type="checkbox" disabled />
                    </label>
                    <label className="studio-toggle-row">
                      <span>Show Other option</span>
                      <input type="checkbox" checked={selectedQuestion.type === 'select' && /other/i.test(selectedQuestion.options || '')} readOnly />
                    </label>
                  </div>
                </>
              )}

              {propertiesTab === 'logic' && (
                <div className="studio-rules-panel">
                  <div className="studio-panel-title"><Layers size={18} /><span>Logic Builder</span></div>
                  <div className="studio-rule-card">
                    <strong>IF</strong>
                    <p>{selectedQuestion.label || `Q${selectedIndex + 1}`} is answered</p>
                    <strong>THEN</strong>
                    <p>Continue to next question or add skip logic in Phase 2.</p>
                  </div>
                  <button type="button" className="secondary"><Plus size={15} /> Add Logic Rule</button>
                </div>
              )}

              {propertiesTab === 'validation' && (
                <div className="studio-rules-panel">
                  <div className="studio-panel-title"><ShieldCheck size={18} /><span>Validation</span></div>
                  <label>Minimum<input placeholder="No minimum" /></label>
                  <label>Maximum<input placeholder="No maximum" /></label>
                  <label>Action<select defaultValue="warn"><option value="warn">Warn</option><option value="block">Block submission</option></select></label>
                </div>
              )}

              {propertiesTab === 'quality' && (
                <div className="studio-rules-panel">
                  <div className="studio-panel-title"><Flame size={18} /><span>Quality Rules</span></div>
                  <div className="studio-rule-card">
                    <strong>Quality signal</strong>
                    <p>Flag inconsistent answers, short interviews, duplicate GPS points, or risky media gaps.</p>
                  </div>
                  <button type="button" className="secondary"><Plus size={15} /> Add Quality Rule</button>
                </div>
              )}
            </div>
          ) : (
            <div className="studio-empty-properties">
              <Settings size={28} />
              <p>Select a question to edit its properties.</p>
            </div>
          )}
        </aside>
      </div>

      <div className="studio-component-dock">
        <div>
          <div className="section-kicker"><ShieldCheck size={16} /> Survey components</div>
          <p>Set reusable survey features as off, optional, or mandatory for this project.</p>
        </div>
        <div className="studio-component-grid">
          {componentControls.map((component) => {
            const mode = getComponentMode(settings, component.key);
            return (
              <div className={`component-policy-card ${mode}`} key={component.key}>
                <div className="component-policy-header">
                  <span className="component-policy-check">{mode !== 'off' ? <CheckCircle2 size={18} /> : null}</span>
                  <span>
                    <strong>{component.title}</strong>
                    <small>{component.description}</small>
                  </span>
                </div>
                <div className="component-policy-options" role="group" aria-label={`${component.title} policy`}>
                  {componentModes.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`component-policy-option ${option} ${mode === option ? 'active' : ''}`}
                      onClick={() => updateComponentPolicy(component.key, option)}
                      aria-pressed={mode === option}
                    >
                      {mode === option && <CheckCircle2 size={14} />}
                      {componentModeLabels[option]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="studio-workflow-strip">
        {['Create / Import', 'Build Survey', 'Configure Logic', 'Add Quality Rules', 'Translate', 'Preview & Test', 'Publish'].map((step, index) => (
          <div key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
            <small>
              {index === 0 && 'Start blank, template, or import'}
              {index === 1 && 'Drag, drop, and organise'}
              {index === 2 && 'Skip and branching rules'}
              {index === 3 && 'Fraud and QC checks'}
              {index === 4 && 'Multi-language support'}
              {index === 5 && 'Run test interview'}
              {index === 6 && 'Ready for field deploy'}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

class AdminSectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Unexpected display error'
    };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  componentDidCatch(error, info) {
    console.error('Admin section render failed', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="phase1-shell">
        <div className="panel access-restricted-panel">
          <ShieldCheck size={34} />
          <div>
            <p className="eyebrow">Display recovered</p>
            <h2>This page hit a display error</h2>
            <p>{this.state.message}. Go back to projects or reload the page to continue.</p>
            <div className="actions">
              <button className="secondary" onClick={this.props.onBack}>Back to projects</button>
              <button className="primary" onClick={() => window.location.reload()}>Reload page</button>
            </div>
          </div>
        </div>
      </section>
    );
  }
}

function AccessRestrictedPanel({ roleLabel, section }) {
  return (
    <section className="phase1-shell">
      <div className="panel access-restricted-panel">
        <ShieldCheck size={34} />
        <div>
          <p className="eyebrow">Access controlled</p>
          <h2>This page is not enabled for your role</h2>
          <p>{roleLabel} does not currently include access to the {section} workspace. A Platform Super Admin or Organisation Owner can change this from Users & RBAC.</p>
        </div>
      </div>
    </section>
  );
}

function OrganisationContextPanel({ foundation, draft, onChange, onSave }) {
  const organisation = foundation.organisation || {};
  const workspace = foundation.workspace || {};
  const workingDraft = draft || {
    name: organisation.name || '',
    legalName: organisation.legalName || '',
    website: organisation.website || '',
    primaryContactName: organisation.primaryContactName || '',
    primaryContactEmail: organisation.primaryContactEmail || '',
    primaryContactPhone: organisation.primaryContactPhone || '',
    workspaceName: workspace.name || '',
    workspaceDescription: workspace.description || ''
  };

  function update(field, value) {
    onChange({ ...workingDraft, [field]: value });
  }

  return (
    <section className="phase1-shell">
      <div className="phase1-header">
        <div>
          <p className="eyebrow">Foundation</p>
          <h2>Organisation context</h2>
          <p>Single source for tenant identity, workspace naming, and platform governance.</p>
        </div>
        <button className="primary" onClick={onSave}><Save size={17} /> Save Context</button>
      </div>
      <div className="phase1-overview-grid">
        <SummaryKpiCard icon={<Layers size={18} />} label="Tenant" value={organisation.name || 'VTRAC'} detail={organisation.slug || 'vtrac-worldwide'} accent="teal" />
        <SummaryKpiCard icon={<ClipboardList size={18} />} label="Workspace" value={workspace.name || 'Field Intelligence'} detail={workspace.slug || 'workspace'} accent="blue" />
        <SummaryKpiCard icon={<ShieldCheck size={18} />} label="RBAC roles" value={foundation.roles?.length || 0} detail="Configurable role catalog" accent="sky" />
        <SummaryKpiCard icon={<UserRound size={18} />} label="Access scope" value="Tenant" detail="Projects, users, clients, vendors" accent="amber" />
      </div>
      <div className="panel phase1-editor-card">
        <div className="inline-grid">
          <label>
            Organisation name
            <input value={workingDraft.name} onChange={(event) => update('name', event.target.value)} />
          </label>
          <label>
            Legal name
            <input value={workingDraft.legalName} onChange={(event) => update('legalName', event.target.value)} />
          </label>
          <label>
            Website
            <input value={workingDraft.website} onChange={(event) => update('website', event.target.value)} />
          </label>
        </div>
        <div className="inline-grid">
          <label>
            Primary contact
            <input value={workingDraft.primaryContactName} onChange={(event) => update('primaryContactName', event.target.value)} />
          </label>
          <label>
            Contact email
            <input type="email" value={workingDraft.primaryContactEmail} onChange={(event) => update('primaryContactEmail', event.target.value)} />
          </label>
          <label>
            Contact phone
            <input value={workingDraft.primaryContactPhone} onChange={(event) => update('primaryContactPhone', event.target.value)} />
          </label>
        </div>
        <div className="inline-grid two">
          <label>
            Workspace name
            <input value={workingDraft.workspaceName} onChange={(event) => update('workspaceName', event.target.value)} />
          </label>
          <label>
            Workspace description
            <input value={workingDraft.workspaceDescription} onChange={(event) => update('workspaceDescription', event.target.value)} />
          </label>
        </div>
      </div>
      <RolePermissionMatrix roles={foundation.roles || []} permissions={foundation.permissions || []} />
    </section>
  );
}

function RolePermissionMatrix({ roles, permissions }) {
  return (
    <div className="panel rbac-matrix-card">
      <div className="section-title">
        <div>
          <p className="eyebrow">RBAC</p>
          <h2>Role and permission catalog</h2>
        </div>
        <span className="recovery-count-chip">{roles.length} roles</span>
      </div>
      <div className="rbac-role-grid">
        {roles.map((role) => (
          <div className="rbac-role-card" key={role.key}>
            <div>
              <strong>{role.name}</strong>
              <small>{role.scope}</small>
            </div>
            <p>{role.description}</p>
            <div className="permission-chip-row">
              {(role.permissions || []).includes('*')
                ? <span>All permissions</span>
                : (role.permissions || []).slice(0, 5).map((permission) => <span key={permission}>{permissionLabel(permission, permissions)}</span>)}
              {(role.permissions || []).length > 5 && <span>+{role.permissions.length - 5} more</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserManagementPanel({
  users,
  roles,
  permissions = [],
  projects = [],
  bulkUserText,
  bulkUserWorking,
  onBulkUserTextChange,
  onBulkCreate,
  editingUser,
  onStartNew,
  onEdit,
  onChange,
  onCancel,
  onSave
}) {
  const safeUsers = Array.isArray(users) ? users : [];
  const safeRoles = Array.isArray(roles) ? roles : [];
  const safeProjects = Array.isArray(projects) ? projects : [];
  const editingProjectIds = Array.isArray(editingUser?.assignedProjectIds) ? editingUser.assignedProjectIds : [];
  const editingProjectIdSet = new Set(editingProjectIds.map(String));
  const editingRoleDefinition = safeRoles.find((role) => role.key === editingUser?.role);
  const legacyProjectScopedRoles = new Set(['analyst', 'teamLead', 'floorManager', 'qaQc']);
  const isProjectScopedRole = Boolean(
    editingUser
    && (
      ['project', 'vendor', 'client'].includes(editingRoleDefinition?.scope)
      || legacyProjectScopedRoles.has(editingUser.role)
    )
  );

  function update(field, value) {
    onChange({ ...editingUser, assignedProjectIds: editingProjectIds, [field]: value });
  }

  function toggleProject(projectId) {
    const current = new Set(editingProjectIds.map(String));
    const normalizedProjectId = String(projectId);
    if (current.has(normalizedProjectId)) current.delete(normalizedProjectId);
    else current.add(normalizedProjectId);
    update('assignedProjectIds', [...current]);
  }

  function projectNamesFor(projectIds = []) {
    const ids = new Set((Array.isArray(projectIds) ? projectIds : []).map(String));
    return safeProjects.filter((project) => ids.has(String(project.id))).map((project) => project.name);
  }

  return (
    <section className="phase1-shell">
      <div className="phase1-header">
        <div>
          <p className="eyebrow">Access Control</p>
          <h2>Users & RBAC</h2>
          <p>Create staff access, map emails, assign roles, and scope project/vendor users to the surveys they can see.</p>
        </div>
        <button className="primary" onClick={onStartNew}><Plus size={17} /> New User</button>
      </div>
      <div className="phase1-overview-grid">
        <SummaryKpiCard icon={<UserSearch size={18} />} label="Staff user IDs" value={safeUsers.length} detail="Internal portal accounts" accent="blue" />
        <SummaryKpiCard icon={<ShieldCheck size={18} />} label="Role templates" value={safeRoles.length} detail="RBAC catalog" accent="teal" />
        <SummaryKpiCard icon={<CheckCircle2 size={18} />} label="Active users" value={safeUsers.filter((user) => user.isActive !== false).length} detail="Can sign in today" accent="sky" />
        <SummaryKpiCard icon={<KeyRound size={18} />} label="Login method" value="Email/ID" detail="Username or mapped email" accent="amber" />
      </div>
      <div className="panel phase1-editor-card bulk-user-import-card">
        <div className="bulk-user-head">
          <div>
            <p className="eyebrow">Bulk user creation</p>
            <h3>Create staff IDs from a pasted list</h3>
            <p>Use one row per user: Display Name, email, username, role, temporary password. Passwords must be at least 8 characters.</p>
          </div>
          <button className="secondary" disabled={bulkUserWorking || !bulkUserText?.trim()} onClick={onBulkCreate}>
            <Upload size={16} /> {bulkUserWorking ? 'Creating...' : 'Create IDs'}
          </button>
        </div>
        <textarea
          value={bulkUserText || ''}
          onChange={(event) => onBulkUserTextChange(event.target.value)}
          placeholder={'Nagendra Reddy,nagendra@vtracworldwide.com,nagendra,organisationAdmin,TempPass123\nField Supervisor,supervisor@vtracworldwide.com,supervisor,supervisor,TempPass123'}
        />
      </div>
      {editingUser && (
        <div className="panel phase1-editor-card">
          <div className="inline-grid">
            <label>
              Display name
              <input value={editingUser.displayName} onChange={(event) => update('displayName', event.target.value)} />
            </label>
            <label>
              Username
              <input value={editingUser.username} onChange={(event) => update('username', event.target.value)} />
            </label>
            <label>
              Email
              <input type="email" value={editingUser.email || ''} onChange={(event) => update('email', event.target.value)} />
            </label>
          </div>
          <div className="inline-grid">
            <label>
              Role
              <select value={editingUser.role} onChange={(event) => update('role', event.target.value)}>
                {safeRoles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
                <option value="admin">Legacy Admin</option>
                <option value="analyst">Legacy Analyst</option>
              </select>
            </label>
            <label>
              Branch
              <input value={editingUser.branch || ''} onChange={(event) => update('branch', event.target.value)} />
            </label>
            <label>
              Team
              <input value={editingUser.team || ''} onChange={(event) => update('team', event.target.value)} />
            </label>
          </div>
          <label>
            Password {editingUser.id && <span className="hint-text">leave blank to keep existing password</span>}
            <input type="password" value={editingUser.password || ''} onChange={(event) => update('password', event.target.value)} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={editingUser.isActive !== false} onChange={(event) => update('isActive', event.target.checked)} />
            Active user
          </label>
          {isProjectScopedRole && (
            <div className="access-scope-panel">
              <div className="project-check-list-head">
                <span>
                  <strong>Project scope</strong>
                  <small>Project, vendor, supervisor, designer, QA, and analyst users see only assigned surveys and response data.</small>
                </span>
                <em>{editingProjectIds.length} assigned</em>
              </div>
              <div className="project-check-list">
                {safeProjects.map((project) => (
                  <label className="check-row" key={project.id}>
                    <input
                      type="checkbox"
                      checked={editingProjectIdSet.has(String(project.id))}
                      onChange={() => toggleProject(project.id)}
                    />
                    {project.name}
                  </label>
                ))}
                {safeProjects.length === 0 && <p className="empty">Create a project before assigning access.</p>}
              </div>
            </div>
          )}
          <div className="actions">
            <button className="secondary" onClick={onCancel}>Cancel</button>
            <button className="primary" onClick={() => onSave(editingUser)}><Save size={18} /> Save User</button>
          </div>
        </div>
      )}
      <div className="phase1-table-grid">
        {safeUsers.map((user) => {
          const assignedProjectIds = Array.isArray(user.assignedProjectIds) ? user.assignedProjectIds : [];
          const assignedProjectNames = projectNamesFor(assignedProjectIds);
          return (
            <button className="phase1-access-row" key={user.id} onClick={() => onEdit(user)}>
              <span>
                <strong>{user.displayName}</strong>
                <small>
                  {user.username}{user.email ? ' · ' + user.email : ''}
                  {assignedProjectNames.length ? ` · ${assignedProjectNames.length} scoped project${assignedProjectNames.length === 1 ? '' : 's'}` : ''}
                </small>
              </span>
              <em>{roleDisplayName(user.role, safeRoles)}</em>
              <i className={user.isActive ? 'active' : 'inactive'}>{user.isActive ? 'Active' : 'Inactive'}</i>
            </button>
          );
        })}
        {safeUsers.length === 0 && <p className="empty">No internal users yet.</p>}
      </div>
      <RolePermissionMatrix roles={safeRoles} permissions={permissions} />
    </section>
  );
}

function VendorManagementPanel({ vendors, projects, editingVendor, onStartNew, onEdit, onChange, onCancel, onSave }) {
  const safeVendors = Array.isArray(vendors) ? vendors : [];
  const safeProjects = Array.isArray(projects) ? projects : [];
  const editingProjectIds = Array.isArray(editingVendor?.assignedProjectIds) ? editingVendor.assignedProjectIds : [];
  const editingProjectIdSet = new Set(editingProjectIds.map(String));

  function update(field, value) {
    onChange({ ...editingVendor, assignedProjectIds: editingProjectIds, [field]: value });
  }

  function toggleProject(projectId) {
    const current = new Set(editingProjectIds.map(String));
    const normalizedProjectId = String(projectId);
    if (current.has(normalizedProjectId)) current.delete(normalizedProjectId);
    else current.add(normalizedProjectId);
    update('assignedProjectIds', [...current]);
  }

  function projectNamesFor(projectIds = []) {
    const ids = new Set((Array.isArray(projectIds) ? projectIds : []).map(String));
    return safeProjects.filter((project) => ids.has(String(project.id))).map((project) => project.name);
  }

  return (
    <section className="phase1-shell">
      <div className="phase1-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Vendors</h2>
          <p>Onboard field vendors, assign survey projects, and monitor each partner only within their approved scope.</p>
        </div>
        <button className="primary" onClick={onStartNew}><Plus size={17} /> New Vendor</button>
      </div>
      {editingVendor && (
        <div className="panel phase1-editor-card">
          <div className="inline-grid">
            <label>
              Vendor name
              <input value={editingVendor.name} onChange={(event) => update('name', event.target.value)} />
            </label>
            <label>
              Contact name
              <input value={editingVendor.contactName || ''} onChange={(event) => update('contactName', event.target.value)} />
            </label>
            <label>
              Contact email
              <input type="email" value={editingVendor.contactEmail || ''} onChange={(event) => update('contactEmail', event.target.value)} />
            </label>
          </div>
          <div className="inline-grid">
            <label>
              Contact phone
              <input value={editingVendor.contactPhone || ''} onChange={(event) => update('contactPhone', event.target.value)} />
            </label>
            <label>
              Service area
              <input value={editingVendor.serviceArea || ''} onChange={(event) => update('serviceArea', event.target.value)} />
            </label>
            <label>
              Status
              <select value={editingVendor.status || 'Active'} onChange={(event) => update('status', event.target.value)}>
                <option>Active</option>
                <option>Paused</option>
                <option>Inactive</option>
              </select>
            </label>
          </div>
          <div className="access-scope-panel vendor-login-panel">
            <div className="project-check-list-head">
              <span>
                <strong>Vendor portal login</strong>
                <small>Create a scoped Vendor Admin login for this partner. Leave username blank if this vendor does not need portal access.</small>
              </span>
              <em>{editingVendor.loginUsername ? 'Login enabled' : 'No login'}</em>
            </div>
            <div className="inline-grid">
              <label>
                Login username
                <input
                  value={editingVendor.loginUsername || ''}
                  onChange={(event) => update('loginUsername', event.target.value)}
                  placeholder="vendorname"
                />
              </label>
              <label>
                Temporary password {editingVendor.loginUserId && <span className="hint-text">leave blank to keep existing password</span>}
                <input
                  type="password"
                  value={editingVendor.loginPassword || ''}
                  onChange={(event) => update('loginPassword', event.target.value)}
                  placeholder={editingVendor.loginUserId ? 'Unchanged' : 'Minimum 8 characters'}
                />
              </label>
              <label>
                Login role
                <input value="Vendor Admin" readOnly />
              </label>
            </div>
          </div>
          <label>
            Notes
            <textarea value={editingVendor.notes || ''} onChange={(event) => update('notes', event.target.value)} />
          </label>
          <div className="access-scope-panel">
            <div className="project-check-list-head">
              <span>
                <strong>Assigned survey projects</strong>
                <small>Vendor login access, monitoring, reports, and data visibility are limited to these checked surveys/projects.</small>
              </span>
              <em>{editingProjectIds.length} assigned</em>
            </div>
            <div className="project-check-list">
              {safeProjects.map((project) => (
              <label className="check-row" key={project.id}>
                <input
                  type="checkbox"
                  checked={editingProjectIdSet.has(String(project.id))}
                  onChange={() => toggleProject(project.id)}
                />
                {project.name}
              </label>
              ))}
              {safeProjects.length === 0 && <p className="empty">Create a project before assigning vendor scope.</p>}
            </div>
          </div>
          <div className="actions">
            <button className="secondary" onClick={onCancel}>Cancel</button>
            <button className="primary" onClick={() => onSave(editingVendor)}><Save size={18} /> Save Vendor</button>
          </div>
        </div>
      )}
      <div className="phase1-vendor-grid">
        {safeVendors.map((vendor) => {
          const assignedProjectIds = Array.isArray(vendor.assignedProjectIds) ? vendor.assignedProjectIds : [];
          const assignedProjectNames = projectNamesFor(assignedProjectIds);
          const hasLogin = Boolean(vendor.hasLogin || vendor.loginUsername);
          return (
            <button className="phase1-vendor-card" key={vendor.id} onClick={() => onEdit({ ...vendor, assignedProjectIds })}>
              <span>{vendor.status}</span>
              <strong>{vendor.name}</strong>
              <small>{vendor.contactName || 'No contact'}{vendor.contactEmail ? ' · ' + vendor.contactEmail : ''}</small>
              <em>{hasLogin ? `Login: ${vendor.loginUsername || 'enabled'}` : 'No vendor login'}</em>
              <em>{assignedProjectIds.length} assigned project{assignedProjectIds.length === 1 ? '' : 's'}</em>
              {assignedProjectNames.length > 0 && (
                <div className="assigned-project-list">
                  {assignedProjectNames.slice(0, 3).map((name) => <small key={name}>{name}</small>)}
                  {assignedProjectNames.length > 3 && <small>+{assignedProjectNames.length - 3} more</small>}
                </div>
              )}
            </button>
          );
        })}
        {safeVendors.length === 0 && <p className="empty">No vendors yet.</p>}
      </div>
    </section>
  );
}

function roleDisplayName(roleKey, roles = []) {
  const found = roles.find((role) => role.key === roleKey);
  if (found) return found.name;
  if (roleKey === 'admin') return 'Legacy Admin';
  if (roleKey === 'teamLead') return 'Team Lead';
  if (roleKey === 'floorManager') return 'Floor Manager';
  if (roleKey === 'qaQc') return 'QA/QC';
  return roleKey || 'Analyst';
}

function permissionLabel(permissionKey, permissions = []) {
  const found = permissions.find((permission) => permission.key === permissionKey);
  return found?.label || permissionKey;
}

function ClientAccessManager({ clients, projects, editingClient, recoveryRequests = [], onStartNew, onEdit, onChange, onCancel, onSave, onResolveRecovery }) {
  const safeClients = Array.isArray(clients) ? clients : [];
  const safeProjects = Array.isArray(projects) ? projects : [];
  const safeRecoveryRequests = Array.isArray(recoveryRequests) ? recoveryRequests : [];
  const editingProjectIds = Array.isArray(editingClient?.projectIds) ? editingClient.projectIds : [];
  const editingProjectIdSet = new Set(editingProjectIds.map(String));

  function update(field, value) {
    onChange({ ...(editingClient || {}), projectIds: editingProjectIds, [field]: value });
  }

  function toggleProject(projectId) {
    const current = new Set(editingProjectIds.map(String));
    const normalizedProjectId = String(projectId);
    if (current.has(normalizedProjectId)) current.delete(normalizedProjectId);
    else current.add(normalizedProjectId);
    update('projectIds', [...current]);
  }

  function projectNamesFor(projectIds = []) {
    const ids = new Set((Array.isArray(projectIds) ? projectIds : []).map(String));
    return safeProjects.filter((project) => ids.has(String(project.id))).map((project) => project.name);
  }

  return (
    <div className="panel client-admin-panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">Client Access</p>
          <h2>Client logins and project visibility</h2>
          <p>Onboard clients and map the exact surveys/projects they can view. Client dashboards and exports remain scoped to these assignments.</p>
        </div>
        <button className="primary" onClick={onStartNew}><Plus size={18} /> New Client</button>
      </div>

      {editingClient && (
        <div className="client-editor">
          <div className="inline-grid">
            <label>
              Display name
              <input value={editingClient.displayName || ''} onChange={(event) => update('displayName', event.target.value)} />
            </label>
            <label>
              Username
              <input value={editingClient.username || ''} onChange={(event) => update('username', event.target.value)} />
            </label>
            <label>
              Email
              <input type="email" value={editingClient.email || ''} onChange={(event) => update('email', event.target.value)} placeholder="name@client.com" />
            </label>
          </div>
          <label>
            Password {editingClient.id && <span className="hint-text">leave blank to keep existing password</span>}
            <input type="password" value={editingClient.password || ''} onChange={(event) => update('password', event.target.value)} />
            <span className="hint-text">{editingClient.email ? 'Email sends a secure setup/reset link. Password is not emailed.' : 'Without email, share this password manually.'}</span>
          </label>
          <div className="access-scope-panel">
            <div className="project-check-list-head">
              <span>
                <strong>Enabled client survey projects</strong>
                <small>Only checked projects appear in this client user's dashboard, reports, downloads, and project summaries.</small>
              </span>
              <em>{editingProjectIds.length} assigned</em>
            </div>
            <div className="project-check-list">
              {safeProjects.map((project) => (
                <label className="check-row" key={project.id}>
                  <input
                    type="checkbox"
                    checked={editingProjectIdSet.has(String(project.id))}
                    onChange={() => toggleProject(project.id)}
                  />
                  {project.name}
                </label>
              ))}
              {safeProjects.length === 0 && <p className="empty">Create a project before assigning client access.</p>}
            </div>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={editingClient.isActive !== false} onChange={(event) => update('isActive', event.target.checked)} />
            Active
          </label>
          <div className="actions">
            <button className="secondary" onClick={onCancel}>Cancel</button>
            <button className="primary" onClick={() => onSave(editingClient)}><Save size={18} /> Save Client</button>
          </div>
        </div>
      )}

      <div className="client-list">
        {safeClients.length === 0 && <p className="empty">No client logins yet.</p>}
        {safeClients.map((client) => {
          const assignedProjectIds = Array.isArray(client.projectIds) ? client.projectIds : [];
          const assignedProjectNames = projectNamesFor(assignedProjectIds);
          return (
            <button className="client-list-row" key={client.id} onClick={() => onEdit({ ...client, projectIds: assignedProjectIds })}>
              <span>
                <strong>{client.displayName || client.username || 'Client user'}</strong>
                <small>{client.username}{client.email ? ' · ' + client.email : ''} · {client.isActive !== false ? 'Active' : 'Inactive'}</small>
                {assignedProjectNames.length > 0 && (
                  <small className="assigned-project-line">
                    {assignedProjectNames.slice(0, 3).join(' · ')}{assignedProjectNames.length > 3 ? ` · +${assignedProjectNames.length - 3} more` : ''}
                  </small>
                )}
              </span>
              <em>{assignedProjectIds.length} project{assignedProjectIds.length === 1 ? '' : 's'}</em>
            </button>
          );
        })}
      </div>

      <div className="recovery-admin-card">
        <div className="section-title compact-section-title">
          <div>
            <p className="eyebrow">Account recovery</p>
            <h3>Forgot username / password requests</h3>
          </div>
          <span className="recovery-count-chip">{safeRecoveryRequests.filter((request) => request.status !== 'Resolved').length} pending</span>
        </div>
        {safeRecoveryRequests.length === 0 && <p className="empty">No recovery requests yet.</p>}
        {safeRecoveryRequests.map((request) => {
          const isResolved = request.status === 'Resolved';
          return (
            <div className="recovery-request-row" key={request.id}>
              <span>
                <strong>{request.requestType === 'username' ? 'Forgot username' : 'Forgot password'} · {request.accountType}</strong>
                <small>
                  {request.matchedDisplayName || request.matchedUsername || request.identifier || request.email || 'Unmatched account'}
                  {request.email ? ' · ' + request.email : ''}
                </small>
              </span>
              <em>{formatDateTime(request.requestedAt)}</em>
              <button className="secondary compact-button" disabled={isResolved || !onResolveRecovery} onClick={() => onResolveRecovery(request.id)}>
                {isResolved ? 'Resolved' : 'Mark resolved'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResponseEditor({ response, mode = 'edit', project, onChange, onCancel, onSave, onDownloadAudio, audioPreview }) {
  const readOnly = mode === 'view';

  function update(field, value) {
    if (readOnly) return;
    onChange({ ...response, [field]: value });
  }

  function updateAnswer(questionId, value) {
    if (readOnly) return;
    onChange({
      ...response,
      answers: deriveAnswers({ ...response.answers, [questionId]: value })
    });
  }

  function autoClean() {
    if (readOnly) return;
    onChange({
      ...response,
      answers: autoCleanAnswers(response.answers, project?.questions || [])
    });
  }

  const findings = response.qualityFindings || [];
  const auditLogs = response.auditLogs || [];
  const qualityScore = response.qualityScore ?? 100;
  const reviewStatus = response.reviewStatus || 'Accept';

  return (
    <div className="response-editor-backdrop" role="presentation">
      <div className="panel response-editor" role="dialog" aria-modal="true" aria-label={`${readOnly ? 'View' : 'Edit'} response ${response.id}`}>
        <div className="section-title">
          <div>
            <p className="eyebrow">{readOnly ? 'View Submission' : 'Edit Submission'}</p>
            <h2>Response #{response.id}</h2>
            <p>Submitted {new Date(response.submittedAt).toLocaleString()}</p>
          </div>
          <div className="actions">
            {response.hasAudio && (
              <button className="download audio-download" onClick={() => onDownloadAudio(response.id)}>
                <Download size={16} /> Audio
              </button>
            )}
            {!readOnly && <button className="secondary" onClick={autoClean}><RefreshCw size={18} /> Auto-clean</button>}
            <button className="secondary" onClick={onCancel}>{readOnly ? 'Close' : 'Cancel'}</button>
            {!readOnly && <button className="primary" onClick={() => onSave(response)}><Save size={18} /> Save Response</button>}
          </div>
        </div>

        <div className={`quality-review-card ${reviewStatus.toLowerCase()}`}>
          <div>
            <span className="quality-label">Quality score</span>
            <strong>{qualityScore}</strong>
            <span className="quality-status">{reviewStatus}</span>
          </div>
          <div>
            <span className="quality-label">Supervisor signals</span>
            <p>{findings.length ? `${findings.length} finding${findings.length === 1 ? '' : 's'} need review` : 'No quality findings recorded yet.'}</p>
          </div>
        </div>

        {findings.length > 0 && (
          <div className="quality-findings-panel">
            <h3>Quality findings</h3>
            {findings.map((finding) => (
              <div className={`quality-finding ${finding.severity}`} key={`${finding.ruleKey}-${finding.message}`}>
                <span>{finding.severity}</span>
                <p>{finding.message}</p>
                <strong>-{finding.scoreImpact}</strong>
              </div>
            ))}
          </div>
        )}

        {response.hasAudio && (
          <div className="audio-review-card">
            <div>
              <strong>Audio review</strong>
              <span>{audioPreview?.mimeType ? audioPreview.mimeType : 'Loading recording...'}</span>
            </div>
            {audioPreview?.url ? (
              <audio controls preload="metadata">
                <source src={audioPreview.url} type={audioPreview.mimeType || response.audioMimeType || 'audio/webm'} />
                Your browser cannot play this audio. Please download it.
              </audio>
            ) : (
              <p>{audioPreview?.error || 'Preparing audio preview...'}</p>
            )}
          </div>
        )}

        <div className="inline-grid">
          <label>
            Enumerator
            <input value={response.enumeratorName} onChange={(event) => update('enumeratorName', event.target.value)} disabled={readOnly} />
          </label>
          <label>
            Location
            <select value={response.location} onChange={(event) => update('location', event.target.value)} disabled={readOnly}>
              {(project?.locations || []).map((location) => <option key={location}>{location}</option>)}
            </select>
          </label>
        </div>

        <div className="inline-grid">
          <label>
            Respondent name
            <input value={response.respondentName || ''} onChange={(event) => update('respondentName', event.target.value)} disabled={readOnly} />
          </label>
          <label>
            Respondent phone
            <input value={response.respondentPhone || ''} onChange={(event) => update('respondentPhone', event.target.value)} disabled={readOnly} />
          </label>
        </div>

        <div className="review-question-list">
          {(project?.questions || [])
            .filter((question) => !hiddenQuestionIds.has(question.id))
            .filter((question) => questionAppliesToLocation(question.id, response.location))
            .map((question) => (
              <QuestionInput
                key={question.id}
                question={question}
                index={(project?.questions || []).findIndex((item) => item.id === question.id)}
                value={response.answers?.[question.id] || ''}
                onChange={(value) => updateAnswer(question.id, value)}
                disabled={readOnly}
              />
            ))}
        </div>

        <div className="audit-trail-panel">
          <h3>Correction audit trail</h3>
          {auditLogs.length === 0 ? (
            <p className="empty">No admin corrections have been saved for this response.</p>
          ) : (
            auditLogs.map((log) => (
              <div className="audit-log-row" key={log.id}>
                <div>
                  <strong>{log.changedBy || 'Admin'}</strong>
                  <span>{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <p>{(log.changedFields || []).join(', ') || 'Response updated'}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function autoCleanAnswers(answers, questions) {
  const next = { ...answers };
  for (const question of questions) {
    const value = next[question.id];
    if (!value) continue;

    if (question.id.includes('locality')) {
      const cleaned = closestOption(value, Object.keys(originLocalityMap));
      if (cleaned && cleaned !== value) {
        next[question.id] = cleaned;
        const mapping = originLocalityMap[cleaned];
        const prefix = question.id.startsWith('destination_') ? 'destination' : 'origin';
        next[`${prefix}_zone_number`] = String(mapping.zoneNumber);
        next[`${prefix}_mapped_area`] = mapping.area;
        next[`${prefix}_division`] = mapping.division;
      }
    }

    if ((question.id.includes('city') || question.label.toLowerCase().includes('city')) && question.options?.length > 0) {
      const cleaned = closestOption(value, question.options);
      if (cleaned) next[question.id] = cleaned;
    }
  }
  return deriveAnswers(next);
}

function closestOption(value, options) {
  const normalizedValue = normalizeForMatch(value);
  const exact = options.find((option) => normalizeForMatch(option) === normalizedValue);
  if (exact) return exact;
  const scored = options
    .map((option) => ({ option, score: editDistance(normalizeForMatch(option), normalizedValue) }))
    .sort((a, b) => a.score - b.score)[0];
  return scored && scored.score <= Math.max(2, Math.floor(normalizedValue.length * 0.25)) ? scored.option : value;
}

function normalizeForMatch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function RecentTable({ rows, project, loading, onView, onEdit }) {
  const [selectedRows, setSelectedRows] = useState([]);
  const [columnFilters, setColumnFilters] = useState({});
  const [showFields, setShowFields] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  const questionColumns = (project?.questions || [])
    .filter((question) => !hiddenQuestionIds.has(question.id))
    .map((question) => ({
      key: `answer:${question.id}`,
      label: question.label,
      type: question.type,
      options: question.options || [],
      width: 190,
      value: (row) => row.answers?.[question.id] ?? ''
    }));

  const baseColumns = [
    { key: 'validation', label: 'Validation', type: 'select', options: ['Accept', 'Review', 'Reject'], width: 130, value: (row) => row.review_status || 'Accept' },
    { key: 'quality_score', label: 'Quality', type: 'number', width: 110, value: (row) => row.quality_score ?? 100 },
    { key: 'submitted_at', label: 'Submitted', type: 'date', width: 140, value: (row) => formatProjectDate(row.submitted_at) },
    { key: 'enumerator_name', label: 'Enumerator', type: 'text', width: 150, value: (row) => row.enumerator_name || '-' },
    { key: 'location', label: 'Location', type: 'text', width: 230, value: (row) => row.location || '-' },
    { key: 'respondent_name', label: 'Respondent', type: 'text', width: 160, value: (row) => row.respondent_name || '-' }
  ];

  const allColumns = [...baseColumns, ...questionColumns];
  const visibleColumns = allColumns.filter((column) => !hiddenColumns.includes(column.key));

  const filteredRows = rows.filter((row) => visibleColumns.every((column) => {
    const filterValue = String(columnFilters[column.key] || '').trim().toLowerCase();
    if (!filterValue) return true;
    return String(column.value(row) || '').toLowerCase().includes(filterValue);
  }));

  const totalPages = Math.max(Math.ceil(filteredRows.length / pageSize), 1);
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(startIndex, startIndex + pageSize);
  const visibleRowIds = pageRows.map((row) => row.id);
  const allVisibleSelected = visibleRowIds.length > 0 && visibleRowIds.every((id) => selectedRows.includes(id));

  function toggleRow(rowId, checked) {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (checked) next.add(rowId);
      else next.delete(rowId);
      return [...next];
    });
  }

  function toggleVisibleRows(checked) {
    setSelectedRows((current) => {
      const next = new Set(current);
      visibleRowIds.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return [...next];
    });
  }

  function updateFilter(key, value) {
    setColumnFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function toggleColumn(key, checked) {
    setHiddenColumns((current) => {
      if (checked) return current.filter((item) => item !== key);
      return [...current, key];
    });
  }

  return (
    <div className="data-grid-shell">
      <div className="data-grid-toolbar">
        <button className="field-toggle" onClick={() => setShowFields(!showFields)}>
          <Eye size={18} /> hide fields
        </button>
        <div className="data-grid-tools">
          <span>{loading ? 'Refreshing...' : `${filteredRows.length} results`}</span>
          <button className="icon-button" aria-label="Expand table"><ExternalLink size={18} /></button>
          <button className="icon-button" aria-label="Table settings"><ShieldCheck size={18} /></button>
        </div>
      </div>

      {showFields && (
        <div className="field-panel">
          {allColumns.map((column) => (
            <label className="check-row" key={column.key}>
              <input
                type="checkbox"
                checked={!hiddenColumns.includes(column.key)}
                onChange={(event) => toggleColumn(column.key, event.target.checked)}
              />
              {column.label}
            </label>
          ))}
        </div>
      )}

      <div className="data-grid-scroll">
        <table className="response-grid-table">
          <colgroup>
            <col style={{ width: '118px' }} />
            {visibleColumns.map((column) => <col key={column.key} style={{ width: `${column.width}px` }} />)}
          </colgroup>
          <thead>
            <tr className="grid-heading-row">
              <th className="grid-counter-cell">
                <strong>{filteredRows.length === 0 ? '0' : `${startIndex + 1} - ${Math.min(startIndex + pageSize, filteredRows.length)}`}</strong>
                <span>{filteredRows.length} results</span>
              </th>
              {visibleColumns.map((column) => (
                <th key={column.key}>
                  <span className="grid-column-title">{column.type === 'number' && <small>123</small>}{column.label}</span>
                </th>
              ))}
            </tr>
            <tr className="grid-filter-row">
              <th>
                <input
                  className="row-checkbox-input"
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleVisibleRows(event.target.checked)}
                  aria-label="Select visible responses"
                />
              </th>
              {visibleColumns.map((column) => (
                <th key={column.key}>
                  {column.type === 'select' && column.options.length <= 12 ? (
                    <select value={columnFilters[column.key] || ''} onChange={(event) => updateFilter(column.key, event.target.value)}>
                      <option value="">Show All</option>
                      {column.options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input
                      value={columnFilters[column.key] || ''}
                      onChange={(event) => updateFilter(column.key, event.target.value)}
                      placeholder="Search"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr className={selectedRows.includes(row.id) ? 'checked-row' : ''} key={row.id}>
                <td className="grid-actions-cell">
                  <input
                    className="row-checkbox-input"
                    type="checkbox"
                    checked={selectedRows.includes(row.id)}
                    onChange={(event) => toggleRow(row.id, event.target.checked)}
                    aria-label={`Select response ${row.id}`}
                  />
                  <button onClick={() => onView(row.id)} aria-label={`View response ${row.id}`} title="View response"><Eye size={18} /></button>
                  <button onClick={() => onEdit(row.id)} aria-label={`Edit response ${row.id}`} title="Edit response"><Pencil size={18} /></button>
                </td>
                {visibleColumns.map((column) => (
                  <td key={column.key} title={String(column.value(row) || '-')}>{String(column.value(row) || '-')}</td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1}><p className="empty">No responses match the current filters.</p></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="data-grid-pagination">
        <button className="secondary compact-button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Prev</button>
        <span>Page <strong>{currentPage}</strong> of {totalPages}</span>
        <label>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            <option value={15}>15 rows</option>
            <option value={30}>30 rows</option>
            <option value={50}>50 rows</option>
          </select>
        </label>
        <button className="secondary compact-button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
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

function ClientMetric({ icon, label, value, detail }) {
  return (
    <div className="client-kpi-card">
      <div>
        <span>{icon}{label}</span>
        <strong>{value}</strong>
      </div>
      <p>{detail}</p>
    </div>
  );
}

function ClientInsight({ title, value, meta }) {
  return (
    <div className="client-insight-card">
      <span>{title}</span>
      <strong title={value}>{value}</strong>
      <p>{meta}</p>
    </div>
  );
}

function SurveyOSFoundationDashboard({
  clients,
  data,
  download,
  foundation,
  loading,
  session,
  roleInfo,
  onOpenAnalytics,
  onOpenClients,
  onOpenOrganisation,
  onOpenProjectWorkspace,
  onOpenProjectMap,
  onOpenProjects,
  onFocusSearch,
  onOpenRefresh,
  onOpenUsers,
  onOpenVendors,
  onRefresh,
  projects,
  totalProjectSubmissions,
  users = [],
  vendors = []
}) {
  const portfolioProjects = projects.filter((project) => project.slug !== 'pilot-survey');
  const dashboardRoleName = roleInfo?.name || displayRoleName(session?.role || 'admin', foundation?.roles || []);
  const dashboardScope = roleInfo?.scope || 'workspace';
  const dashboardUserName = session?.displayName || session?.username || 'Admin';
  const deployedProjects = portfolioProjects.filter((project) => getProjectStatus(project) === 'deployed');
  const draftProjects = portfolioProjects.filter((project) => getProjectStatus(project) === 'draft');
  const activeClients = clients.filter((client) => client.isActive !== false);
  const activeUsers = users.filter((user) => user.isActive !== false);
  const totalSamples = Number(data?.totals?.total_samples ?? totalProjectSubmissions ?? 0);
  const samplesToday = Number(data?.totals?.samples_today || 0);
  const mappedSamples = (data?.mapRows || []).length;
  const locations = data?.byLocation || [];
  const enumerators = data?.byEnumerator || [];
  const dateRows = data?.byDate || [];
  const sortedDateRows = [...dateRows].sort((a, b) => new Date(a.date) - new Date(b.date));
  const dateRangeLabel = sortedDateRows.length
    ? `${formatProjectDate(sortedDateRows[0].date)} - ${formatProjectDate(sortedDateRows[sortedDateRows.length - 1].date)}`
    : 'Live range';
  const qualitySummary = data?.qualitySummary || {};
  const reviewQueue = Number(qualitySummary.review_count || 0) + Number(qualitySummary.reject_count || 0);
  const flaggedResponses = Number(qualitySummary.flagged_count || 0);
  const averageQualityScore = Number(qualitySummary.average_quality_score ?? 100);
  const totalOrganisations = Math.max(1, activeClients.length + 1);
  const activeSubscriptions = Math.max(deployedProjects.length, activeClients.length);
  const totalUsers = activeUsers.length + activeClients.length + vendors.length;
  const storageUsedGb = Math.max(0.01, (totalSamples * 0.00016) + (portfolioProjects.length * 0.02));
  const apiCalls = totalSamples * 4 + activeUsers.length * 25;
  const interviewTarget = Math.max(40000, totalSamples);
  const storageTarget = 10;
  const apiTarget = Math.max(200000, apiCalls);
  const topProject = leadingRow(data?.byProject || [], 'project');
  const topLocation = leadingRow(locations, 'location');
  const topEnumerator = leadingRow(enumerators, 'enumerator_name');
  const projectRows = toReportChartRows(
    data?.byProject?.length
      ? data.byProject.filter((row) => row.slug !== 'pilot-survey')
      : portfolioProjects.map((project) => ({ project: project.name, samples: Number(project.responseCount || 0) })),
    'project',
    'samples',
    5
  );
  const subscriptionRows = toReportChartRows([
    { plan: 'Enterprise', count: Math.max(0, activeClients.filter((client) => (client.projectIds || []).length >= 2).length) },
    { plan: 'Business', count: Math.max(0, activeClients.filter((client) => (client.projectIds || []).length === 1).length) },
    { plan: 'Professional', count: Math.max(0, vendors.length) },
    { plan: 'Starter', count: Math.max(0, draftProjects.length) }
  ], 'plan', 'count', 4);
  const locationRows = toReportChartRows(locations, 'location', 'samples', 5);
  const reviewRows = toReportChartRows(data?.byReviewStatus || [], 'review_status', 'samples', 4);
  const recentOrganisations = [
    {
      name: foundation?.organisation?.name || 'VTRAC Worldwide',
      plan: 'Owner',
      status: 'Active',
      users: activeUsers.length,
      interviews: totalSamples,
      joined: 'Current workspace'
    },
    ...activeClients.slice(0, 4).map((client) => ({
      name: client.displayName || client.username,
      plan: (client.projectIds || []).length > 1 ? 'Enterprise' : 'Project',
      status: client.isActive === false ? 'Inactive' : 'Active',
      users: 1,
      interviews: client.projectIds?.reduce((sum, projectId) => {
        const project = portfolioProjects.find((item) => String(item.id) === String(projectId));
        return sum + Number(project?.responseCount || 0);
      }, 0) || 0,
      joined: 'Client access'
    }))
  ];
  const platformUsage = [
    { label: 'Interviews', value: formatStatNumber(totalSamples) + ' / ' + formatStatNumber(interviewTarget), pct: Math.min(100, Math.round((totalSamples / Math.max(interviewTarget, 1)) * 100)), tone: 'purple' },
    { label: 'Mapped GPS samples', value: formatStatNumber(mappedSamples) + ' / ' + formatStatNumber(totalSamples), pct: Math.min(100, Math.round((mappedSamples / Math.max(totalSamples, 1)) * 100)), tone: 'blue' },
    { label: 'Storage estimate', value: storageUsedGb.toFixed(storageUsedGb >= 1 ? 1 : 2) + ' GB / ' + storageTarget + ' GB', pct: Math.min(100, Math.round((storageUsedGb / storageTarget) * 100)), tone: 'teal' },
    { label: 'API activity estimate', value: formatStatNumber(apiCalls) + ' / ' + formatStatNumber(apiTarget), pct: Math.min(100, Math.round((apiCalls / Math.max(apiTarget, 1)) * 100)), tone: 'orange' }
  ];
  const systemAlerts = [
    { level: flaggedResponses > 0 ? 'critical' : 'good', text: flaggedResponses > 0 ? 'Quality flags need review' : 'Quality checks running', meta: flaggedResponses > 0 ? formatStatNumber(flaggedResponses) + ' flagged' : 'Healthy' },
    { level: reviewQueue > 0 ? 'warning' : 'good', text: reviewQueue > 0 ? 'Responses pending supervisor review' : 'Review queue clear', meta: reviewQueue > 0 ? formatStatNumber(reviewQueue) + ' pending' : 'Ready' },
    { level: storageUsedGb > 8 ? 'warning' : 'good', text: 'Storage usage estimate', meta: storageUsedGb.toFixed(storageUsedGb >= 1 ? 1 : 2) + ' GB' },
    { level: 'good', text: 'Latest data refresh available', meta: samplesToday + ' today' }
  ];
  const auditRows = [
    { user: 'Admin', action: 'Opened platform dashboard', entity: 'SurveyOS', detail: 'Super admin overview', time: 'Now' },
    { user: 'System', action: 'Loaded project metrics', entity: 'Projects', detail: formatStatNumber(portfolioProjects.length) + ' projects indexed', time: 'Live' },
    { user: 'System', action: 'Checked quality queue', entity: 'Responses', detail: formatStatNumber(reviewQueue) + ' pending review', time: 'Live' },
    { user: 'System', action: 'Mapped field coverage', entity: 'Locations', detail: formatStatNumber(mappedSamples) + ' GPS records', time: 'Live' }
  ];
  const workspaceName = foundation?.workspace?.name || 'Platform workspace';
  const organisationName = foundation?.organisation?.name || 'VTRAC Worldwide';
  const topClientLabel = activeClients[0]?.displayName || activeClients[0]?.username || 'No client yet';

  function openProjectTab(tab = 'summary') {
    if (portfolioProjects.length === 0) {
      onOpenProjects();
      return;
    }
    onOpenProjectWorkspace(tab);
  }

  function sidebarButton(label, icon, action, active = false) {
    return (
      <button type="button" className={active ? 'active' : ''} onClick={action || (() => {})}>
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  function kpiCard(icon, label, value, detail, tone) {
    return (
      <div className={'superadmin-kpi-card ' + tone}>
        <div className="superadmin-kpi-icon">{icon}</div>
        <div>
          <span>{label}</span>
          <strong title={String(value)}>{value}</strong>
          <small>{detail}</small>
        </div>
      </div>
    );
  }

  function renderUsageRow(item) {
    return (
      <div className={'superadmin-usage-row ' + item.tone} key={item.label}>
        <div>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <em>{item.pct}%</em>
        </div>
        <i><b style={{ width: item.pct + '%' }} /></i>
      </div>
    );
  }

  function renderProgressRow(row, index) {
    return (
      <div className="superadmin-progress-row" key={row.value || row.label || index}>
        <span title={row.value}>{truncateText(row.value, 30)}</span>
        <i><b style={{ width: Math.max(3, Number(row.percentage || 0)) + '%' }} /></i>
        <strong>{formatStatNumber(row.frequency)}</strong>
      </div>
    );
  }

  return (
    <section id="surveyos-overview" className="admin-section surveyos-super-admin">
      <div className="superadmin-stage-label">1. {dashboardRoleName} Dashboard</div>
      <div className="superadmin-shell">
        <aside className="superadmin-sidebar">
          <div className="superadmin-brand">
            <img src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
            <div>
              <strong>SurveyOS</strong>
              <span>Field Intelligence Platform</span>
            </div>
          </div>
          <nav className="superadmin-nav" aria-label="Platform navigation">
            {sidebarButton('Platform Overview', <Layers size={15} />, undefined, true)}
            <p>Platform</p>
            {sidebarButton('Organisations', <UserRound size={15} />, onOpenOrganisation)}
            {sidebarButton('Subscriptions', <ClipboardList size={15} />, onOpenClients)}
            {sidebarButton('Plans', <FileText size={15} />, onOpenProjects)}
            {sidebarButton('Revenue', <TrendingUp size={15} />, onOpenAnalytics)}
            {sidebarButton('AI Usage', <Flame size={15} />, onOpenAnalytics)}
            {sidebarButton('System Health', <ShieldCheck size={15} />, onRefresh)}
            {sidebarButton('Audit Logs', <Eye size={15} />, onOpenUsers)}
            {sidebarButton('Feature Flags', <Settings size={15} />, onOpenOrganisation)}
            {sidebarButton('Integrations', <Share2 size={15} />, onOpenVendors)}
            <p>Settings</p>
            {sidebarButton('Users', <UserSearch size={15} />, onOpenUsers)}
            {sidebarButton('Roles & Permissions', <ShieldCheck size={15} />, onOpenUsers)}
            {sidebarButton('Email Templates', <FileText size={15} />, onOpenOrganisation)}
            {sidebarButton('Settings', <Settings size={15} />, onOpenOrganisation)}
          </nav>
          <div className="superadmin-health-card">
            <ShieldCheck size={22} />
            <strong>System Health</strong>
            <span>{loading ? 'Refreshing metrics...' : 'All visible services operational'}</span>
            <button type="button" onClick={onRefresh}>View status</button>
          </div>
        </aside>

        <div className="superadmin-main">
          <header className="superadmin-header">
            <div>
              <h2>{dashboardRoleName}</h2>
              <span>{dashboardScope}</span>
            </div>
            <div className="superadmin-header-actions">
              <button type="button" className="superadmin-date" onClick={onRefresh}>{dateRangeLabel} <CalendarClock size={14} /></button>
              <button type="button" aria-label="Search projects" onClick={onFocusSearch}><Search size={17} /></button>
              <button type="button" aria-label="Refresh platform data" onClick={onRefresh}><RefreshCw size={17} /></button>
              <button type="button" aria-label="Open projects" onClick={onOpenProjects}><ClipboardList size={17} /></button>
              <div className="superadmin-avatar">{dashboardUserName.charAt(0).toUpperCase()}<i /></div>
            </div>
          </header>

          <div className="superadmin-kpi-grid">
            {kpiCard(<UserRound size={22} />, 'Total Organisations', formatStatNumber(totalOrganisations), '+ ' + formatStatNumber(activeClients.length) + ' client orgs', 'purple')}
            {kpiCard(<CalendarClock size={22} />, 'Active Subscriptions', formatStatNumber(activeSubscriptions), '+ ' + formatStatNumber(deployedProjects.length) + ' deployed projects', 'purple')}
            {kpiCard(<TrendingUp size={22} />, 'Monthly Recurring Revenue', 'Not linked', 'Billing module pending', 'pink')}
            {kpiCard(<UserSearch size={22} />, 'Total Users', formatStatNumber(totalUsers), '+ ' + formatStatNumber(activeUsers.length) + ' staff users', 'blue')}
            {kpiCard(<ClipboardList size={22} />, 'Total Interviews', formatStatNumber(totalSamples), '+ ' + formatStatNumber(samplesToday) + ' today', 'blue')}
            {kpiCard(<Flame size={22} />, 'AI Credits Used', '0', 'AI module not connected', 'purple')}
            {kpiCard(<Layers size={22} />, 'Storage Used', storageUsedGb.toFixed(storageUsedGb >= 1 ? 1 : 2) + ' GB', formatStatNumber(mappedSamples) + ' mapped samples', 'teal')}
          </div>

          <div className="superadmin-dashboard-grid">
            <div className="superadmin-panel superadmin-chart-panel">
              <div className="superadmin-card-head">
                <div>
                  <span>Interview volume overview</span>
                  <strong>{formatStatNumber(totalSamples)}</strong>
                  <small>Current filtered platform data</small>
                </div>
                <button type="button" onClick={onRefresh}>This Month</button>
              </div>
              <TrendLineChart rows={dateRows} labelKey="date" valueKey="samples" />
            </div>

            <div className="superadmin-panel superadmin-donut-panel">
              <div className="superadmin-card-head">
                <div>
                  <span>Subscriptions by Plan</span>
                  <strong>{formatStatNumber(activeSubscriptions)}</strong>
                  <small>Total assigned access plans</small>
                </div>
              </div>
              <DonutQuestionChart rows={subscriptionRows} />
            </div>

            <div className="superadmin-panel superadmin-chart-panel">
              <div className="superadmin-card-head">
                <div>
                  <span>AI Usage Trend</span>
                  <strong>0</strong>
                  <small>AI credits not connected yet</small>
                </div>
                <button type="button" onClick={onRefresh}>This Month</button>
              </div>
              <TrendLineChart rows={dateRows.map((row) => ({ ...row, samples: 0 }))} labelKey="date" valueKey="samples" />
            </div>

            <div className="superadmin-panel superadmin-table-panel">
              <div className="superadmin-card-head compact">
                <span>Recent Organisations</span>
                <button type="button" onClick={onOpenClients}>View all organisations</button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Users</th>
                    <th>Interviews</th>
                    <th>Joined On</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrganisations.map((row) => (
                    <tr key={row.name}>
                      <td>{truncateText(row.name, 28)}</td>
                      <td>{row.plan}</td>
                      <td><span className={'superadmin-status-pill ' + row.status.toLowerCase()}>{row.status}</span></td>
                      <td>{formatStatNumber(row.users)}</td>
                      <td>{formatStatNumber(row.interviews)}</td>
                      <td>{row.joined}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="superadmin-panel superadmin-alert-panel">
              <div className="superadmin-card-head compact">
                <span>System Alerts</span>
                <button type="button" onClick={onRefresh}>View all alerts</button>
              </div>
              <div className="superadmin-alert-list">
                {systemAlerts.map((alert) => (
                  <div className={'superadmin-alert-row ' + alert.level} key={alert.text}>
                    <i />
                    <span>{alert.text}</span>
                    <strong>{alert.meta}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="superadmin-panel superadmin-usage-panel">
              <div className="superadmin-card-head compact">
                <span>Platform Usage</span>
                <button type="button" onClick={onOpenAnalytics}>Usage details</button>
              </div>
              {platformUsage.map(renderUsageRow)}
            </div>

            <div className="superadmin-panel superadmin-geo-panel">
              <div className="superadmin-card-head compact">
                <span>Geographical Distribution</span>
                <button type="button" onClick={() => { if (onOpenProjectMap) onOpenProjectMap(); else openProjectTab('data'); }}>Open map</button>
              </div>
              <div className="superadmin-coverage-map">
                <div className="superadmin-map-orbit">
                  <span>{formatStatNumber(locations.length)}</span>
                  <small>locations</small>
                </div>
                <div className="superadmin-map-list">
                  {(locationRows.length ? locationRows : [{ value: 'No field locations yet', frequency: 0, percentage: '0.00' }]).map(renderProgressRow)}
                </div>
              </div>
            </div>

            <div className="superadmin-panel superadmin-audit-panel">
              <div className="superadmin-card-head compact">
                <span>Audit Log</span>
                <button type="button" onClick={onOpenUsers}>View audit logs</button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Details</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr key={row.user + row.action}>
                      <td>{row.user}</td>
                      <td>{row.action}</td>
                      <td>{row.entity}</td>
                      <td>{row.detail}</td>
                      <td>{row.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="superadmin-footer-strip">
            <span>{workspaceName}</span>
            <span>{organisationName}</span>
            <span>{topClientLabel}</span>
            <span>{topProject ? truncateText(topProject.label, 36) : 'No active project yet'}</span>
            <span>Quality score {formatStatNumber(averageQualityScore)}</span>
          </footer>
        </div>
      </div>
    </section>
  );
}

function PortfolioDashboard({
  clients,
  clientProjectRows,
  data,
  download,
  filterOptions,
  filters,
  loading,
  loadDashboard,
  projects,
  setAppliedFilters,
  setFilters,
  totalProjectSubmissions
}) {
  const portfolioProjects = projects.filter((project) => project.slug !== 'pilot-survey');
  const projectRowsSource = data?.byProject?.length
    ? data.byProject.filter((row) => row.slug !== 'pilot-survey')
    : portfolioProjects.map((project) => ({ project: project.name, samples: Number(project.responseCount || 0) }));
  const portfolioCounts = {
    all: portfolioProjects.length,
    deployed: portfolioProjects.filter((project) => getProjectStatus(project) === 'deployed').length,
    draft: portfolioProjects.filter((project) => getProjectStatus(project) === 'draft').length,
    archived: portfolioProjects.filter((project) => getProjectStatus(project) === 'archived').length
  };
  const totalSamples = Number(data?.totals?.total_samples ?? totalProjectSubmissions ?? 0);
  const topProject = leadingRow(projectRowsSource, 'project');
  const topLocation = leadingRow(data?.byLocation || [], 'location');
  const topEnumerator = leadingRow(data?.byEnumerator || [], 'enumerator_name');
  const projectRows = toReportChartRows(projectRowsSource, 'project', 'samples', 8);
  const locationRows = toReportChartRows(data?.byLocation || [], 'location', 'samples', 8);
  const enumeratorRows = toReportChartRows(data?.byEnumerator || [], 'enumerator_name', 'samples', 8);
  const reviewRows = toReportChartRows(data?.byReviewStatus || [], 'review_status', 'samples', 4);
  const clientAccessRows = toReportChartRows(clientProjectRows || [], 'label', 'samples', 8);
  const statusRows = toReportChartRows([
    { status: 'Deployed', samples: portfolioCounts.deployed },
    { status: 'Draft', samples: portfolioCounts.draft },
    { status: 'Archived', samples: portfolioCounts.archived }
  ], 'status', 'samples', 3);

  return (
    <section id="portfolio-dashboard" className="admin-section admin-dashboard-section portfolio-dashboard-section">
      <div className="section-title">
        <div>
          <p className="eyebrow">Portfolio Dashboard</p>
          <h2>All projects overview</h2>
          <p>Cross-project collection performance, access, locations, and team activity.</p>
        </div>
        <div className="actions">
          <button className="download" onClick={() => download('csv')}><Download size={16} /> CSV</button>
          <button className="download" onClick={() => download('xlsx')}><Download size={16} /> Excel</button>
        </div>
      </div>

      <div className="summary-kpi-grid portfolio-kpi-grid">
        <SummaryKpiCard icon={<ClipboardList size={18} />} label="Portfolio projects" value={formatStatNumber(portfolioCounts.all)} detail={`${portfolioCounts.deployed} deployed, ${portfolioCounts.draft} draft, ${portfolioCounts.archived} archived`} accent="teal" />
        <SummaryKpiCard icon={<BarChart3 size={18} />} label="Filtered samples" value={formatStatNumber(totalSamples)} detail={topProject ? `${truncateText(topProject.label, 30)} leads` : 'No samples yet'} accent="blue" />
        <SummaryKpiCard icon={<MapPin size={18} />} label="Field locations" value={formatStatNumber(data?.byLocation?.length || 0)} detail={topLocation ? `${truncateText(topLocation.label, 28)} leads` : 'No locations yet'} accent="sky" />
        <SummaryKpiCard icon={<UserRound size={18} />} label="Enumerators" value={formatStatNumber(data?.byEnumerator?.length || 0)} detail={topEnumerator ? `${truncateText(topEnumerator.label, 24)} leads` : 'No enumerators yet'} accent="amber" />
        <SummaryKpiCard icon={<ShieldCheck size={18} />} label="Client logins" value={formatStatNumber(clients.length)} detail={`${clientAccessRows.length} with assigned projects`} accent="pink" />
      </div>

      <div className="panel filters admin-filters portfolio-filters">
        <label>
          <span>Enumerator</span>
          <select value={filters.enumerator} onChange={(event) => setFilters({ ...filters, enumerator: event.target.value })}>
            <option value="">All enumerators</option>
            {filterOptions.enumerators.map((enumerator) => <option key={enumerator}>{enumerator}</option>)}
          </select>
        </label>
        <label>
          <span>Location</span>
          <select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}>
            <option value="">All locations</option>
            {filterOptions.locations.map((location) => <option key={location}>{location}</option>)}
          </select>
        </label>
        <label>
          <span>Date from</span>
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
        </label>
        <label>
          <span>Date to</span>
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
        </label>
        <div className="filter-actions">
          <button className="primary" onClick={() => setAppliedFilters(filters)}><Search size={18} /> Search</button>
          <button className="secondary compact-button" onClick={loadDashboard} disabled={loading}>
            <RefreshCw size={15} /> {loading ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>
      </div>

      {loading && <p className="status">Refreshing portfolio dashboard...</p>}

      <div className="summary-dashboard-grid portfolio-modern-grid">
        <div className="panel summary-card summary-trend-card" data-export-graph data-export-title="portfolio-sample-trend">
          <div className="summary-card-head">
            <div>
              <span>Trend</span>
              <h3><TrendingUp size={17} /> Portfolio sample trend</h3>
            </div>
            <div className="summary-card-actions">
              <strong>{formatStatNumber(totalSamples)} total</strong>
              <GraphDownloadButtons filename="vtrac-portfolio-sample-trend" />
            </div>
          </div>
          <TrendLineChart rows={data?.byDate || []} labelKey="date" valueKey="samples" />
        </div>

        <div className="panel summary-card summary-mix-card" data-export-graph data-export-title="portfolio-project-status">
          <div className="summary-card-head">
            <div>
              <span>Status</span>
              <h3><PieChart size={17} /> Project status mix</h3>
            </div>
            <GraphDownloadButtons filename="vtrac-portfolio-project-status" />
          </div>
          {statusRows.length ? <DonutQuestionChart rows={statusRows} /> : <p className="empty">No project status data yet.</p>}
        </div>

        <SummaryRankCard title="Samples by project" rows={projectRows} icon={<ClipboardList size={17} />} />
        <div className="panel summary-card summary-mix-card" data-export-graph data-export-title="review-disposition">
          <div className="summary-card-head">
            <div>
              <span>Quality</span>
              <h3><ShieldCheck size={17} /> Review disposition</h3>
            </div>
            <GraphDownloadButtons filename="vtrac-summary-review-disposition" />
          </div>
          {reviewRows.length ? <DonutQuestionChart rows={reviewRows} /> : <p className="empty">No review status data yet.</p>}
        </div>

        <SummaryRankCard title="Top survey locations" rows={locationRows} icon={<MapPin size={17} />} />
        <SummaryRankCard title="Enumerator contribution" rows={enumeratorRows} icon={<UserRound size={17} />} />
        <SummaryRankCard title="Client project access" rows={clientAccessRows} icon={<ShieldCheck size={17} />} />
      </div>
    </section>
  );
}

function SummaryPerformance({ data }) {
  const totalSamples = Number(data?.totals?.total_samples || 0);
  const samplesToday = Number(data?.totals?.samples_today || 0);
  const locations = data?.byLocation || [];
  const enumerators = data?.byEnumerator || [];
  const dates = data?.byDate || [];
  const gpsSamples = (data?.mapRows || []).length;
  const activeDays = dates.length;
  const averagePerDay = activeDays ? Math.round(totalSamples / activeDays) : 0;
  const topLocation = leadingRow(locations, 'location');
  const topEnumerator = leadingRow(enumerators, 'enumerator_name');
  const terminalRows = toReportChartRows(data?.byTerminal || [], 'terminal', 'samples', 4);
  const movementRows = toReportChartRows(data?.byMovement || [], 'movement', 'samples', 4);
  const reviewRows = toReportChartRows(data?.byReviewStatus || [], 'review_status', 'samples', 4);
  const locationRows = toReportChartRows(locations, 'location', 'samples', 8);
  const enumeratorRows = toReportChartRows(enumerators, 'enumerator_name', 'samples', 9);
  const qualitySummary = data?.qualitySummary || {};
  const averageQualityScore = Number(qualitySummary.average_quality_score ?? 100);
  const reviewQueue = Number(qualitySummary.review_count || 0) + Number(qualitySummary.reject_count || 0);
  const flaggedResponses = Number(qualitySummary.flagged_count || 0);

  return (
    <div className="summary-performance">
      <div className="summary-performance-head">
        <div>
          <p className="eyebrow">Submissions</p>
          <h2>Collection performance</h2>
          <p>Live fieldwork snapshot across submissions, teams, locations, and GPS coverage.</p>
        </div>
        <div className="summary-period-pills">
          <span>7D</span>
          <span>31D</span>
          <span>3M</span>
          <span>12M</span>
        </div>
      </div>

      <div className="summary-kpi-grid">
        <SummaryKpiCard
          icon={<ClipboardList size={18} />}
          label="Total samples"
          value={formatStatNumber(totalSamples)}
          detail={`${formatStatNumber(averagePerDay)} avg/day`}
          accent="teal"
        />
        <SummaryKpiCard
          icon={<CalendarClock size={18} />}
          label="Samples today"
          value={formatStatNumber(samplesToday)}
          detail={`${formatPercent(samplesToday, totalSamples)} of total`}
          accent="blue"
        />
        <SummaryKpiCard
          icon={<MapPin size={18} />}
          label="Field locations"
          value={formatStatNumber(locations.length)}
          detail={topLocation ? `${truncateText(topLocation.label, 28)} leads` : 'No locations yet'}
          accent="sky"
        />
        <SummaryKpiCard
          icon={<UserRound size={18} />}
          label="Enumerators"
          value={formatStatNumber(enumerators.length)}
          detail={topEnumerator ? `${truncateText(topEnumerator.label, 24)} leads` : 'No enumerators yet'}
          accent="amber"
        />
        <SummaryKpiCard
          icon={<MapPin size={18} />}
          label="GPS coverage"
          value={`${formatPercent(gpsSamples, totalSamples)}`}
          detail={`${formatStatNumber(gpsSamples)} mapped samples`}
          accent="pink"
        />
        <SummaryKpiCard
          icon={<ShieldCheck size={18} />}
          label="Quality score"
          value={formatStatNumber(averageQualityScore)}
          detail={`${formatStatNumber(flaggedResponses)} flagged responses`}
          accent="teal"
        />
        <SummaryKpiCard
          icon={<Eye size={18} />}
          label="Review queue"
          value={formatStatNumber(reviewQueue)}
          detail={`${formatPercent(reviewQueue, totalSamples)} need supervisor review`}
          accent="amber"
        />
      </div>

      <div className="summary-dashboard-grid">
        <div className="panel summary-card summary-trend-card" data-export-graph data-export-title="daily-sample-run-rate">
          <div className="summary-card-head">
            <div>
              <span>Trend</span>
              <h3><TrendingUp size={17} /> Daily sample run-rate</h3>
            </div>
            <div className="summary-card-actions">
              <strong>{formatStatNumber(totalSamples)} total</strong>
              <GraphDownloadButtons filename="vtrac-summary-daily-sample-run-rate" />
            </div>
          </div>
          <TrendLineChart rows={dates} labelKey="date" valueKey="samples" />
          <div className="summary-date-strip">
            {dates.slice(0, 4).map((row) => (
              <span key={row.date}><strong>{formatStatNumber(row.samples)}</strong>{formatProjectDate(row.date)}</span>
            ))}
          </div>
        </div>

        <div className="panel summary-card summary-mix-card" data-export-graph data-export-title="terminal-coverage">
          <div className="summary-card-head">
            <div>
              <span>Split</span>
              <h3><PieChart size={17} /> Terminal coverage</h3>
            </div>
            <GraphDownloadButtons filename="vtrac-summary-terminal-coverage" />
          </div>
          {terminalRows.length ? <DonutQuestionChart rows={terminalRows} /> : <p className="empty">No terminal split yet.</p>}
        </div>

        <div className="panel summary-card summary-mix-card" data-export-graph data-export-title="movement-mix">
          <div className="summary-card-head">
            <div>
              <span>Flow</span>
              <h3><PieChart size={17} /> Movement mix</h3>
            </div>
            <GraphDownloadButtons filename="vtrac-summary-movement-mix" />
          </div>
          {movementRows.length ? <DonutQuestionChart rows={movementRows} /> : <p className="empty">No movement split yet.</p>}
        </div>

        <SummaryRankCard title="Top survey locations" rows={locationRows} icon={<MapPin size={17} />} />
        <SummaryRankCard title="Enumerator contribution" rows={enumeratorRows} icon={<UserRound size={17} />} />
      </div>
    </div>
  );
}

function GraphDownloadButtons({ filename }) {
  async function download(format, event) {
    const card = event.currentTarget.closest('[data-export-graph]');
    const fallbackTitle = card?.getAttribute('data-export-title') || 'vtrac-graph';
    try {
      await exportElementAsImage(card, filename || fallbackTitle, format);
    } catch (error) {
      window.alert(error.message || 'Unable to download this graph.');
    }
  }

  return (
    <div className="graph-download-buttons" data-export-ignore="true" aria-label="Download graph">
      <button type="button" className="secondary compact-button" onClick={(event) => download('png', event)} title="Download graph as PNG">
        <ImageIcon size={14} /> PNG
      </button>
      <button type="button" className="secondary compact-button" onClick={(event) => download('jpeg', event)} title="Download graph as JPEG">
        JPG
      </button>
    </div>
  );
}

function SummaryKpiCard({ icon, label, value, detail, accent }) {
  return (
    <div className={`summary-kpi-card ${accent || ''}`.trim()}>
      <div>
        <span>{icon}{label}</span>
        <strong>{value}</strong>
      </div>
      <p>{detail}</p>
    </div>
  );
}

function SummaryRankCard({ title, rows, icon }) {
  const total = rows.reduce((sum, row) => sum + row.frequency, 0);
  const max = Math.max(...rows.map((row) => row.frequency), 1);
  return (
    <div className="panel summary-card summary-rank-card" data-export-graph data-export-title={title}>
      <div className="summary-card-head">
        <div>
          <span>Ranking</span>
          <h3>{icon}{title}</h3>
        </div>
        <div className="summary-card-actions">
          <strong>{formatStatNumber(total)}</strong>
          <GraphDownloadButtons filename={`vtrac-summary-${title}`} />
        </div>
      </div>
      {rows.length === 0 && <p className="empty">No samples yet.</p>}
      <div className="summary-rank-list">
        {rows.map((row, index) => (
          <div className="summary-rank-row" key={row.value}>
            <span title={row.value}>{index + 1}. {row.value}</span>
            <div><i style={{ width: `${(row.frequency / max) * 100}%` }} /></div>
            <strong>{formatStatNumber(row.frequency)}</strong>
            <em>{row.percentage}%</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectReport({ project, data }) {
  const reportRows = data?.reportRows || data?.recent || [];
  const questionReports = useMemo(
    () => buildQuestionReports(project?.questions || [], reportRows),
    [project?.questions, reportRows]
  );
  const totalResponses = reportRows.length;
  const totalQuestions = (project?.questions || []).filter((question) => !hiddenQuestionIds.has(question.id)).length;
  const averageCompletion = questionReports.length
    ? Math.round(questionReports.reduce((sum, report) => sum + report.answerRate, 0) / questionReports.length)
    : 0;
  const strongestSignal = questionReports.find((report) => report.topValue);

  return (
    <div className="auto-report">
      <div className="report-warning">
        Automated report based on submitted survey data. Review and clean records before using final client figures.
      </div>

      <div className="report-hero">
        <div>
          <span>Generated analytics report</span>
          <h2>{project?.name || 'Project report'}</h2>
          <p>
            Kobo-style question summaries with VTRAC infographics, frequencies, percentages,
            response coverage, and numeric statistics.
          </p>
        </div>
        <div className="report-kpi-strip">
          <ReportKpi label="Responses analyzed" value={totalResponses} />
          <ReportKpi label="Questions" value={totalQuestions} />
          <ReportKpi label="Avg. answered" value={`${averageCompletion}%`} />
          <ReportKpi label="Top signal" value={strongestSignal?.topValue || '-'} compact />
        </div>
      </div>

      <div className="report-dashboard-grid mixed-report-grid">
        <TrendChartPanel title="Submission trend" rows={data?.byDate || []} labelKey="date" valueKey="samples" />
        <DonutBreakdownPanel title="Location mix" rows={data?.byLocation || []} labelKey="location" valueKey="samples" />
        <RankedBreakdownPanel title="Enumerator contribution" rows={data?.byEnumerator || []} labelKey="enumerator_name" valueKey="samples" />
      </div>

      <div className="question-report-grid">
        {questionReports.length === 0 && (
          <div className="panel empty-state-panel">
            <BarChart3 size={34} />
            <h2>No report data yet</h2>
            <p>Question-level summaries will appear after responses are submitted.</p>
          </div>
        )}
        {questionReports.map((report, index) => (
          <QuestionReportCard key={report.id} report={report} index={index} />
        ))}
      </div>
    </div>
  );
}

function ReportKpi({ label, value, compact = false }) {
  return (
    <div className={`report-kpi ${compact ? 'compact' : ''}`.trim()}>
      <span>{label}</span>
      <strong title={String(value)}>{value}</strong>
    </div>
  );
}

const reportChartPalette = ['#0aa7a4', '#133e98', '#2f80ed', '#7c5cff', '#f59e0b', '#ef476f', '#27ae60'];

function TrendChartPanel({ title, rows, labelKey, valueKey }) {
  return (
    <div className="panel report-chart-card trend-card" data-export-graph data-export-title={title}>
      <div className="report-chart-head">
        <h2><TrendingUp size={17} /> {title}</h2>
        <GraphDownloadButtons filename={`vtrac-report-${title}`} />
      </div>
      <TrendLineChart rows={rows} labelKey={labelKey} valueKey={valueKey} />
    </div>
  );
}

function DonutBreakdownPanel({ title, rows, labelKey, valueKey }) {
  const chartRows = toReportChartRows(rows, labelKey, valueKey, 5);
  return (
    <div className="panel report-chart-card" data-export-graph data-export-title={title}>
      <div className="report-chart-head">
        <h2><PieChart size={17} /> {title}</h2>
        <GraphDownloadButtons filename={`vtrac-report-${title}`} />
      </div>
      {chartRows.length === 0 ? <p className="empty">No samples yet.</p> : <DonutQuestionChart rows={chartRows} />}
    </div>
  );
}

function RankedBreakdownPanel({ title, rows, labelKey, valueKey }) {
  const chartRows = toReportChartRows(rows, labelKey, valueKey, 7);
  return (
    <div className="panel report-chart-card" data-export-graph data-export-title={title}>
      <div className="report-chart-head">
        <h2><BarChart3 size={17} /> {title}</h2>
        <GraphDownloadButtons filename={`vtrac-report-${title}`} />
      </div>
      {chartRows.length === 0 ? <p className="empty">No samples yet.</p> : <RankQuestionChart rows={chartRows} />}
    </div>
  );
}

function DonutQuestionChart({ rows }) {
  const topRows = rows.filter((row) => row.frequency > 0).slice(0, 6);
  const topValue = topRows[0];
  if (topRows.length === 0) return <p className="empty">No answer distribution yet.</p>;

  return (
    <div className="donut-chart-wrap">
      <div
        className="donut-chart"
        style={{ background: makeDonutGradient(topRows) }}
        aria-label="Response split donut chart"
      >
        <div className="donut-center">
          <strong>{topValue?.percentage || 0}%</strong>
          <span>Top</span>
        </div>
      </div>
      <div className="donut-legend">
        {topRows.map((row, index) => (
          <div className="donut-legend-row" key={row.value}>
            <i style={{ background: reportChartPalette[index % reportChartPalette.length] }} />
            <span title={row.value}>{row.value}</span>
            <strong>{row.frequency}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendQuestionChart({ rows }) {
  return (
    <div className="question-trend-wrap">
      <TrendLineChart rows={rows} labelKey="value" valueKey="frequency" compact />
    </div>
  );
}

function RankQuestionChart({ rows }) {
  const max = Math.max(...rows.map((row) => row.frequency), 1);
  return (
    <div className="report-mini-bars rank-chart">
      {rows.slice(0, 7).map((row, index) => (
        <div className="report-mini-row" key={row.value}>
          <span title={row.value}>{row.value}</span>
          <div><i style={{ width: `${(row.frequency / max) * 100}%`, background: reportChartPalette[index % reportChartPalette.length] }} /></div>
          <strong>{row.percentage}%</strong>
        </div>
      ))}
    </div>
  );
}

function TileQuestionChart({ rows }) {
  const max = Math.max(...rows.map((row) => row.frequency), 1);
  return (
    <div className="tile-chart">
      {rows.slice(0, 9).map((row, index) => (
        <div
          className="tile-chart-cell"
          key={row.value}
          style={{
            '--tile-weight': Math.max(1, Math.round((row.frequency / max) * 5)),
            '--tile-color': reportChartPalette[index % reportChartPalette.length]
          }}
        >
          <span title={row.value}>{row.value}</span>
          <strong>{row.percentage}%</strong>
        </div>
      ))}
    </div>
  );
}

function TrendLineChart({ rows, labelKey, valueKey, compact = false }) {
  const series = normalizeTrendRows(rows, labelKey, valueKey);
  if (series.length === 0) return <p className="empty">No trend data yet.</p>;
  const width = 260;
  const height = compact ? 112 : 148;
  const chartHeight = compact ? 68 : 88;
  const max = Math.max(...series.map((row) => row.value), 1);
  const points = series.map((row, index) => {
    const x = series.length === 1 ? width / 2 : 12 + (index * ((width - 24) / (series.length - 1)));
    const y = 14 + (chartHeight - ((row.value / max) * chartHeight));
    return { ...row, x, y };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPoints = `${points[0].x},${height - 28} ${linePoints} ${points[points.length - 1].x},${height - 28}`;
  const latest = series[series.length - 1];
  const total = series.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className={`trend-chart ${compact ? 'compact' : ''}`.trim()}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Submission trend line chart">
        <polygon points={areaPoints} className="trend-area" />
        <polyline points={linePoints} className="trend-line" />
        {points.map((point) => (
          <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="3.5" />
        ))}
      </svg>
      <div className="trend-chart-foot">
        <span>{series[0]?.label}</span>
        <strong>{total} total</strong>
        <span>{latest?.label}</span>
      </div>
    </div>
  );
}

function QuestionReportCard({ report, index }) {
  const filename = `vtrac-question-${index + 1}-${report.label}`;
  return (
    <div className="question-report-card" data-export-graph data-export-title={`${index + 1}-${report.label}`}>
      <div className="question-report-head">
        <div>
          <span>{index + 1}. {report.typeLabel}</span>
          <h3>{report.label}</h3>
          <p>
            {report.answered} out of {report.total} respondents answered this question.
            {' '}({report.missing} without data)
          </p>
        </div>
        <div className="question-report-actions">
          <strong>{report.answerRate}%</strong>
          <GraphDownloadButtons filename={filename} />
        </div>
      </div>

      {report.kind === 'number' ? (
        <div className="numeric-stat-grid">
          <ReportKpi label="Mean" value={report.stats.mean} />
          <ReportKpi label="Median" value={report.stats.median} />
          <ReportKpi label="Mode" value={report.stats.mode} />
          <ReportKpi label="Std. dev." value={report.stats.stdDev} />
        </div>
      ) : (
        <>
          {report.chartType === 'donut' && <DonutQuestionChart rows={report.rows} />}
          {report.chartType === 'trend' && <TrendQuestionChart rows={report.rows} />}
          {report.chartType === 'tiles' && <TileQuestionChart rows={report.rows} />}
          {report.chartType === 'rank' && <RankQuestionChart rows={report.rows} />}
          <div className="report-frequency-table">
            <table>
              <thead>
                <tr><th>Value</th><th>Frequency</th><th>Percentage</th></tr>
              </thead>
              <tbody>
                {report.rows.slice(0, 8).map((row) => (
                  <tr key={row.value}>
                    <td title={row.value}>{row.value}</td>
                    <td>{row.frequency}</td>
                    <td>{row.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function buildQuestionReports(questions, rows) {
  const visibleQuestions = questions.filter((question) => !hiddenQuestionIds.has(question.id));
  return visibleQuestions.map((question) => {
    const values = rows
      .map((row) => row.answers?.[question.id])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);
    const total = rows.length;
    const answered = values.length;
    const missing = Math.max(total - answered, 0);
    const answerRate = total ? Math.round((answered / total) * 100) : 0;
    const kind = question.type === 'number' ? 'number' : 'category';
    const rowsForQuestion = kind === 'number'
      ? []
      : buildFrequencyRows(values, answered, question.options || [], question.type);

    return {
      id: question.id,
      label: question.label,
      typeLabel: reportTypeLabel(question.type),
      kind,
      total,
      answered,
      missing,
      answerRate,
      topValue: rowsForQuestion[0]?.value || '',
      rows: rowsForQuestion,
      chartType: kind === 'number' ? 'stats' : getQuestionChartType(question, rowsForQuestion),
      stats: kind === 'number' ? numericStats(values) : null
    };
  });
}

function getQuestionChartType(question, rowsForQuestion) {
  if (question.type === 'date') return 'trend';
  if (question.type === 'textarea') return 'tiles';
  if (question.type === 'text') return rowsForQuestion.length > 8 ? 'tiles' : 'rank';
  if (rowsForQuestion.length <= 5) return 'donut';
  if (rowsForQuestion.length <= 10) return 'rank';
  return 'tiles';
}

function toReportChartRows(rows, labelKey, valueKey, limit = 5) {
  const normalized = rows
    .map((row) => ({
      value: formatDashboardLabel(row[labelKey] || '-', labelKey),
      frequency: Number(row[valueKey]) || 0
    }))
    .filter((row) => row.frequency > 0)
    .sort((a, b) => b.frequency - a.frequency);
  const total = normalized.reduce((sum, row) => sum + row.frequency, 0);
  const topRows = normalized.slice(0, limit);
  const otherTotal = normalized.slice(limit).reduce((sum, row) => sum + row.frequency, 0);
  const combined = otherTotal > 0 ? [...topRows, { value: 'Other', frequency: otherTotal }] : topRows;
  return combined.map((row) => ({
    ...row,
    percentage: total ? Number(((row.frequency / total) * 100).toFixed(2)) : 0
  }));
}

function makeDonutGradient(rows) {
  const total = rows.reduce((sum, row) => sum + row.frequency, 0);
  if (!total) return '#eef3f8';
  let cursor = 0;
  const segments = rows.map((row, index) => {
    const start = cursor;
    const end = cursor + ((row.frequency / total) * 100);
    cursor = end;
    return `${reportChartPalette[index % reportChartPalette.length]} ${start}% ${end}%`;
  });
  return `conic-gradient(from -90deg, ${segments.join(', ')})`;
}

function normalizeTrendRows(rows, labelKey, valueKey) {
  return rows
    .map((row) => ({
      label: String(row[labelKey] || '-'),
      value: Number(row[valueKey]) || 0
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => {
      const aDate = Date.parse(a.label);
      const bDate = Date.parse(b.label);
      if (Number.isFinite(aDate) && Number.isFinite(bDate)) return aDate - bDate;
      return a.label.localeCompare(b.label);
    });
}

function buildFrequencyRows(values, answered, options, questionType) {
  const optionLookup = new Map((options || []).map((option) => [normalizeForMatch(option), option]));
  const counts = new Map();
  for (const rawValue of values) {
    const cleanValue = optionLookup.get(normalizeForMatch(rawValue)) || rawValue;
    counts.set(cleanValue, (counts.get(cleanValue) || 0) + 1);
  }

  const ordered = [...counts.entries()]
    .map(([value, frequency]) => ({
      value,
      frequency,
      percentage: answered ? Number(((frequency / answered) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      if (questionType === 'select') {
        const aIndex = options.indexOf(a.value);
        const bIndex = options.indexOf(b.value);
        if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      }
      return a.value.localeCompare(b.value);
    });

  return ordered.length ? ordered : [{ value: 'No data', frequency: 0, percentage: 0 }];
}

function numericStats(values) {
  const numbers = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (numbers.length === 0) {
    return { mean: '-', median: '-', mode: '-', stdDev: '-' };
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const median = sorted.length % 2
    ? sorted[Math.floor(sorted.length / 2)]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const counts = new Map();
  numbers.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const mode = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? '-';
  const variance = numbers.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / numbers.length;
  return {
    mean: formatStatNumber(mean),
    median: formatStatNumber(median),
    mode: formatStatNumber(mode),
    stdDev: formatStatNumber(Math.sqrt(variance))
  };
}

function formatStatNumber(value) {
  if (value === '-') return value;
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercent(value, total) {
  const denominator = Number(total) || 0;
  if (!denominator) return '0%';
  return `${Math.round((Number(value || 0) / denominator) * 100)}%`;
}

function truncateText(value, maxLength) {
  const text = String(value || '-');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function reportTypeLabel(type) {
  if (type === 'select') return 'TYPE: SELECT ONE';
  if (type === 'number') return 'TYPE: NUMERIC';
  if (type === 'date') return 'TYPE: DATE';
  if (type === 'textarea') return 'TYPE: LONG TEXT';
  return 'TYPE: TEXT';
}

function Breakdown({ title, rows, labelKey, valueKey, className = '' }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey])), 1);
  return (
    <div className={`panel breakdown ${className}`.trim()}>
      <h2><BarChart3 size={17} /> {title}</h2>
      {rows.length === 0 && <p className="empty">No samples yet.</p>}
      {rows.map((row) => (
        <div className="bar-row" key={row[labelKey]}>
          <span>{formatDashboardLabel(row[labelKey], labelKey).slice(0, 28)}</span>
          <div><i style={{ width: `${(Number(row[valueKey]) / max) * 100}%` }} /></div>
          <strong>{row[valueKey]}</strong>
        </div>
      ))}
    </div>
  );
}
