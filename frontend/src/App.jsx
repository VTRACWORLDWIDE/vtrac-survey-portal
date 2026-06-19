import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Link2,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

const apiBase = import.meta.env.VITE_API_BASE || '';
const blankQuestion = { id: '', label: '', type: 'text', options: '', required: false };
const airportPrefix = 'Kempegowda International Airport - ';
const defaultProjectSlug = 'bengaluru-second-airport-feasibility';
const defaultProjectSettings = {
  airportLocationMode: false,
  captureGps: false,
  captureAudio: false,
  showRespondentPhone: true,
  showHouseholdId: false
};
const airportTerminals = ['Terminal 1', 'Terminal 2'];
const airportMovements = ['Departures', 'Arrivals'];
const airportSurveyPoints = {
  Departures: ['Departure gates', 'Cab/Taxi point', 'Bus point', 'Other'],
  Arrivals: ['Arrival gates', 'Cab/Taxi point', 'Bus point', 'Other']
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
  const isAdminRoute = route.startsWith('/admin');
  const publicSlug = isPublicSurvey ? route.replace('/p/', '') : defaultProjectSlug;

  return (
    <main>
      {!isPublicSurvey && !isAdminRoute && <header className="topbar">
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
        : route.startsWith('/admin')
        ? <AdminApp />
        : <ClientApp />}
    </main>
  );
}

function SurveyForm({ projectSlug }) {
  const [config, setConfig] = useState({ locations: [], questions: [] });
  const settings = { ...defaultProjectSettings, ...(config.settings || {}) };
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
    if (settings.captureAudio) beginRequiredAudio();
    if (settings.captureGps) requestGpsCapture();
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
    if (!settings.captureGps || gpsAttemptedRef.current || gpsPosition) return;
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
    if (settings.captureAudio) {
      finalAudio = await finalizeAudioRecording();
    }
    const submissionPayload = {
      ...form,
      projectSlug,
      ...gpsPosition,
      audio: settings.captureAudio ? finalAudio : null,
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
              airportMode={settings.airportLocationMode}
            />
          </div>

          <div className="form-section">
            <div className="section-kicker"><FileText size={16} /> Respondent</div>
            <div className="inline-grid">
              <label>
                Respondent name
                <input value={form.respondentName} onChange={(event) => update('respondentName', event.target.value)} />
              </label>
              {settings.showRespondentPhone && (
                <label>
                  Phone
                  <input inputMode="tel" value={form.respondentPhone} onChange={(event) => update('respondentPhone', event.target.value)} />
                </label>
              )}
              {settings.showHouseholdId && (
                <label>
                  Household ID
                  <input value={form.householdId} onChange={(event) => update('householdId', event.target.value)} />
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
          {(settings.captureGps || settings.captureAudio) && (
            <div className="panel quiet-panel">
              <h2>Capture Modules</h2>
              <div className="info-list">
                {settings.captureGps && <span><MapPin size={17} /> GPS: {gpsStatus}</span>}
                {settings.captureAudio && <span><ShieldCheck size={17} /> Audio: {audioStatus}</span>}
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
  const usesAirportFlow = airportMode || locations.some((location) => location.startsWith(airportPrefix)) || value.startsWith(airportPrefix);

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
  const knownPoint = airportSurveyPoints[movement]?.find((item) => item === rawPoint);
  if (knownPoint) {
    return { location, terminal, movement, point: knownPoint, otherText: '' };
  }
  if (rawPoint.startsWith('Other - ')) {
    return { location, terminal, movement, point: 'Other', otherText: rawPoint.replace('Other - ', '') };
  }
  return { location, terminal, movement, point: 'Other', otherText: rawPoint };
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
  const [username, setUsername] = useState('client');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  async function submit(event) {
    event.preventDefault();
    setStatus('');
    const response = await fetch(`${apiBase}/api/client/login`, {
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
        <div className="login-mark"><BarChart3 size={24} /></div>
        <div>
          <p className="eyebrow">VTRAC Client</p>
          <h2>Sign in to view collection progress</h2>
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

function leadingRow(rows, labelKey) {
  const sorted = [...(rows || [])].sort((left, right) => Number(right.samples || 0) - Number(left.samples || 0));
  const row = sorted[0];
  if (!row) return null;
  return {
    label: row[labelKey] || 'Not specified',
    samples: Number(row.samples || 0)
  };
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

function ClientDashboard({ token, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const authHeaders = { Authorization: `Bearer ${token}` };
  const selectedProject = projects.find((project) => project.id === selectedId) || projects[0];
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
  const latestDate = dateRows[0];
  const dateScope = formatDateScope(filters.dateFrom, filters.dateTo);

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
    const response = await fetch(`${apiBase}/api/client/projects`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    setProjects(payload.projects || []);
    setSelectedId((current) => current || payload.projects?.[0]?.id || '');
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

  return (
    <section className="dashboard client-dashboard client-analytics">
      <div className="client-hero">
        <div className="client-hero-copy">
          <p className="eyebrow">VTRAC Client View</p>
          <h2>Collection Analytics Dashboard</h2>
          <p>{selectedProject ? selectedProject.name : 'Survey progress'}</p>
          <div className="client-chip-row">
            <span className="client-chip"><CalendarClock size={15} /> {dateScope}</span>
            <span className="client-chip"><ClipboardList size={15} /> {totalSamples} samples</span>
            <span className="client-chip"><MapPin size={15} /> {coveredTerminalRows.length || 0} terminals covered</span>
          </div>
        </div>
        <div className="client-hero-actions">
          <button className="secondary" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="panel client-command-bar">
        <label>
          Project
          <select value={selectedProject?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label>
          From
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
        </label>
        <label>
          To
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
        </label>
        <button className="primary compact-refresh" onClick={loadDashboard}><RefreshCw size={17} /> Refresh</button>
      </div>

      <div className="client-kpi-grid">
        <ClientMetric icon={<ClipboardList size={19} />} label="Total samples" value={totalSamples} detail="All project submissions" />
        <ClientMetric icon={<CalendarClock size={19} />} label="Today" value={todaySamples} detail={todaySamples === 1 ? 'Sample collected today' : 'Samples collected today'} />
        <ClientMetric icon={<MapPin size={19} />} label="Terminals covered" value={coveredTerminalRows.length} detail={leadingTerminal ? `Lead: ${leadingTerminal.label}` : 'Awaiting field data'} />
        <ClientMetric icon={<BarChart3 size={19} />} label="Survey points" value={surveyPointRows.length} detail={leadingPoint ? `Top point: ${leadingPoint.label}` : 'Awaiting field data'} />
      </div>

      <div className="client-insight-grid">
        <ClientInsight title="Primary terminal" value={leadingTerminal?.label || 'No data yet'} meta={leadingTerminal ? `${leadingTerminal.samples} samples` : 'Field collection not started'} />
        <ClientInsight title="Movement mix" value={leadingMovement?.label || 'No data yet'} meta={leadingMovement ? `${leadingMovement.samples} samples currently leading` : 'Departures and arrivals will appear here'} />
        <ClientInsight title="Active survey point" value={leadingPoint?.label || 'No data yet'} meta={leadingPoint ? `${leadingPoint.samples} samples` : 'No survey point submissions yet'} />
        <ClientInsight title="Latest collection day" value={latestDate?.date || 'No data yet'} meta={latestDate ? `${latestDate.samples} samples submitted` : 'Date trend will update automatically'} />
      </div>

      <div className="client-analytics-grid">
        <Breakdown className="span-2" title="Daily sample trend" rows={dateRows} labelKey="date" valueKey="samples" />
        <Breakdown title="Terminal coverage" rows={terminalRows} labelKey="terminal" valueKey="samples" />
        <Breakdown title="Departures vs arrivals" rows={movementRows} labelKey="movement" valueKey="samples" />
        <Breakdown title="Survey point performance" rows={surveyPointRows} labelKey="survey_point" valueKey="samples" />
        <Breakdown title="Top locations" rows={locationRows} labelKey="location" valueKey="samples" />
      </div>

      {loading && <p className="status client-loading">Refreshing dashboard...</p>}
    </section>
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
    <section className="admin-login-screen">
      <div className="admin-login-topbar">
        <div className="admin-brand-mark">
          <img src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
          <span>VTRAC Survey Console</span>
        </div>
      </div>
      <form className="admin-login-card" onSubmit={submit}>
        <div className="login-mark"><ShieldCheck size={24} /></div>
        <p className="eyebrow">Administrator</p>
        <h2>Sign in to manage field projects</h2>
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
  const [clients, setClients] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ enumerators: [], locations: [] });
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [editingResponse, setEditingResponse] = useState(null);
  const [audioPreview, setAudioPreview] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('deployed');
  const [activeAdminSection, setActiveAdminSection] = useState('projects');
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [filters, setFilters] = useState({ enumerator: '', location: '', dateFrom: '', dateTo: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const selectedProject = projects.find((project) => project.id === selectedId) || projects[0];
  const filteredProjects = projects.filter((project) => {
    const search = projectSearch.trim().toLowerCase();
    const matchesSearch = !search || `${project.name} ${project.slug}`.toLowerCase().includes(search);
    const matchesStatus =
      projectStatusFilter === 'all' ||
      (projectStatusFilter === 'deployed' && project.isActive) ||
      (projectStatusFilter === 'draft' && !project.isActive) ||
      projectStatusFilter === 'archived';
    return matchesSearch && matchesStatus;
  });
  const projectCounts = {
    all: projects.length,
    deployed: projects.filter((project) => project.isActive).length,
    draft: projects.filter((project) => !project.isActive).length,
    archived: 0
  };
  const authHeaders = { Authorization: `Bearer ${token}` };

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedProject?.id) params.set('projectId', selectedProject.id);
    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [appliedFilters, selectedProject?.id]);

  async function loadProjects() {
    const response = await fetch(`${apiBase}/api/projects`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    setProjects(payload.projects || []);
    setSelectedId((current) => current || payload.projects?.[0]?.id || '');
  }

  async function loadClients() {
    const response = await fetch(`${apiBase}/api/admin/clients`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    setClients(payload.clients || []);
  }

  async function loadFilterOptions() {
    if (!selectedProject) return;
    const params = new URLSearchParams({ projectId: selectedProject.id });
    const response = await fetch(`${apiBase}/api/dashboard/options?${params.toString()}`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    setFilterOptions({
      enumerators: payload.enumerators || [],
      locations: payload.locations || []
    });
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

  function changeSelectedProject(projectId) {
    const emptyFilters = { enumerator: '', location: '', dateFrom: '', dateTo: '' };
    setSelectedId(projectId);
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  }

  function openAdminSection(section) {
    setActiveAdminSection(section);
    const targetId = section === 'library' ? 'response-filters' : section === 'account' ? 'client-access' : 'project-library';
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function filterProjects(statusFilter) {
    setProjectStatusFilter(statusFilter);
    setActiveAdminSection('projects');
    document.getElementById('project-library')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    loadProjects();
    loadClients();
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [queryString]);

  useEffect(() => {
    loadFilterOptions();
  }, [selectedProject?.id]);

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
    setEditing({
      name: '',
      slug: '',
      description: '',
      locations: 'Kadiri\nAnantapur\nOther',
      settings: { ...defaultProjectSettings },
      isActive: true,
      questions: [{ ...blankQuestion, label: 'Sample question', type: 'text', required: true }]
    });
  }

  function editProject(project) {
    setEditing({
      ...project,
      locations: project.locations.join('\n'),
      settings: { ...defaultProjectSettings, ...(project.settings || {}) },
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

  function startNewClient() {
    setEditingClient({
      username: '',
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
    setStatus('Client access saved.');
    setEditingClient(null);
    await loadClients();
  }

  async function reviewResponse(responseId) {
    setStatus('');
    const response = await fetch(`${apiBase}/api/responses/${responseId}`, { headers: authHeaders });
    if (response.status === 401) return onLogout();
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || 'Unable to load response.');
      return;
    }
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
    <section className="admin-console">
      <div className="admin-console-topbar">
        <div className="admin-brand-mark">
          <img src="/vtrac-logo.jpg" alt="VTRAC Intelligent Traffic Solutions" />
          <span>VTRAC Survey Console</span>
        </div>
        <label className="admin-search">
          <Search size={22} />
          <input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" />
        </label>
        <button className="admin-avatar" onClick={onLogout} title="Logout">A</button>
      </div>

      <div className={`admin-console-shell ${menuCollapsed ? 'menu-collapsed' : ''}`}>
        <aside className="admin-icon-rail">
          <button className={activeAdminSection === 'projects' ? 'active' : ''} onClick={() => openAdminSection('projects')} title="Projects"><ClipboardList size={24} /></button>
          <button className={activeAdminSection === 'library' ? 'active' : ''} onClick={() => openAdminSection('library')} title="Response library"><BookOpen size={24} /></button>
          <button className={activeAdminSection === 'account' ? 'active' : ''} onClick={() => openAdminSection('account')} title="Client accounts"><UserRound size={24} /></button>
        </aside>

        <aside className="admin-sidebar">
          <button className="admin-collapse-button" onClick={() => setMenuCollapsed(!menuCollapsed)} aria-label={menuCollapsed ? 'Expand menu' : 'Collapse menu'}>
            {menuCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span>{menuCollapsed ? 'Expand' : 'Collapse menu'}</span>
          </button>
          <button className="admin-new-button" onClick={startNewProject}>NEW</button>
          <button className={`admin-sidebar-row ${projectStatusFilter === 'all' ? 'active' : ''}`} onClick={() => filterProjects('all')}>
            <span>All projects</span>
            <strong>{projectCounts.all}</strong>
          </button>
          <button className={`admin-sidebar-row ${projectStatusFilter === 'deployed' ? 'active' : ''}`} onClick={() => filterProjects('deployed')}>
            <span>Deployed</span>
            <strong>{projectCounts.deployed}</strong>
          </button>
          <button className={`admin-sidebar-row ${projectStatusFilter === 'draft' ? 'active' : ''}`} onClick={() => filterProjects('draft')}>
            <span>Draft</span>
            <strong>{projectCounts.draft}</strong>
          </button>
          <button className={`admin-sidebar-row ${projectStatusFilter === 'archived' ? 'active' : ''}`} onClick={() => filterProjects('archived')}>
            <span>Archived</span>
            <strong>{projectCounts.archived}</strong>
          </button>
          {selectedProject && (
            <div className="admin-selected-card">
              <span>Selected project</span>
              <strong>{selectedProject.name}</strong>
              <a href={selectedProject.publicUrl} target="_blank" rel="noreferrer"><Link2 size={15} /> Public survey link</a>
            </div>
          )}
        </aside>

        <div className="admin-main">
          <div id="project-library" />
          <div className="admin-project-toolbar">
            <div>
              <h2>My Projects</h2>
              <p>{filteredProjects.length} shown · {projects.length} total · {projectStatusFilter}</p>
            </div>
            <div className="admin-toolbar-actions">
              <button className="toolbar-link" onClick={() => openAdminSection('library')}>
                <Search size={16} /> filter
              </button>
              <button className="toolbar-link" onClick={() => selectedProject && editProject(selectedProject)}>
                <FileText size={16} /> fields
              </button>
              <button className="icon-button" onClick={() => selectedProject && editProject(selectedProject)} aria-label="Edit selected project"><FileText size={18} /></button>
              <button className="icon-button" onClick={startNewClient} aria-label="Add client"><UserRound size={18} /></button>
              <button className="icon-button danger-button" onClick={() => setStatus('Archive/delete workflow is not enabled for pilot safety.')} aria-label="Archive disabled"><Trash2 size={18} /></button>
            </div>
          </div>

          <div className="admin-project-table">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Project name</th>
                    <th>Status</th>
                    <th>Owner</th>
                    <th>Last modified</th>
                    <th>Date deployed</th>
                    <th>Submissions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => (
                    <tr className={project.id === selectedProject?.id ? 'selected-row' : ''} key={project.id} onClick={() => changeSelectedProject(project.id)}>
                      <td><span className="row-checkbox" /></td>
                      <td>
                        <button className="project-name-button" onClick={(event) => { event.stopPropagation(); editProject(project); }}>
                          {project.name}
                        </button>
                        <small>{project.slug}</small>
                      </td>
                      <td><span className={`project-status ${project.isActive ? 'deployed' : 'draft'}`}>{project.isActive ? 'deployed' : 'draft'}</span></td>
                      <td>admin</td>
                      <td>{formatProjectDate(project.updatedAt)}</td>
                      <td>{project.isActive ? formatProjectDate(project.createdAt) : '-'}</td>
                      <td><span className="submission-pill">{project.responseCount || 0}</span></td>
                    </tr>
                  ))}
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

          <section id="response-filters" className="admin-section">
            <div className="section-title">
              <div>
                <p className="eyebrow">Response Review</p>
                <h2>Submissions and exports</h2>
              </div>
              <div className="actions">
                <button className="download" onClick={() => download('csv')}><Download size={16} /> CSV</button>
                <button className="download" onClick={() => download('xlsx')}><Download size={16} /> Excel</button>
              </div>
            </div>

            <div className="panel filters admin-filters">
              <label className="filter-project">
                <span>Project</span>
                <select value={selectedProject?.id || ''} onChange={(event) => changeSelectedProject(event.target.value)}>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
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
                <button className="icon-button" onClick={loadDashboard} aria-label="Refresh dashboard"><RefreshCw size={18} /></button>
              </div>
            </div>

            <div className="metric-grid admin-metrics">
              <Metric icon={<ClipboardList size={19} />} label="Total samples" value={data?.totals?.total_samples ?? 0} />
              <Metric icon={<CalendarClock size={19} />} label="Samples today" value={data?.totals?.samples_today ?? 0} />
              <Metric icon={<UserRound size={19} />} label="Enumerators" value={data?.byEnumerator?.length ?? 0} />
              <Metric icon={<MapPin size={19} />} label="Locations" value={data?.byLocation?.length ?? 0} />
            </div>

            <div className="chart-grid admin-chart-grid">
              <Breakdown title="Samples by date" rows={data?.byDate || []} labelKey="date" valueKey="samples" />
              <Breakdown title="Samples by enumerator" rows={data?.byEnumerator || []} labelKey="enumerator_name" valueKey="samples" />
              <Breakdown title="Samples by location" rows={data?.byLocation || []} labelKey="location" valueKey="samples" />
            </div>

            <RecentTable rows={data?.recent || []} loading={loading} onReview={reviewResponse} />
          </section>

          <section id="client-access">
            <ClientAccessManager
              clients={clients}
              projects={projects}
              editingClient={editingClient}
              onStartNew={startNewClient}
              onEdit={editClient}
              onChange={setEditingClient}
              onCancel={() => setEditingClient(null)}
              onSave={saveClient}
            />
          </section>

          {editingResponse && (
            <ResponseEditor
              response={editingResponse}
              project={selectedProject}
              onChange={setEditingResponse}
              onCancel={() => setEditingResponse(null)}
              onSave={saveResponse}
              onDownloadAudio={downloadAudio}
              audioPreview={audioPreview}
            />
          )}
          {status && <p className="status success">{status}</p>}
        </div>
      </div>
    </section>
  );
}

function ProjectEditor({ project, onChange, onCancel, onSave }) {
  const settings = { ...defaultProjectSettings, ...(project.settings || {}) };

  function update(field, value) {
    onChange({ ...project, [field]: value });
  }

  function updateSetting(field, value) {
    onChange({ ...project, settings: { ...settings, [field]: value } });
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

      <div className="form-section component-settings">
        <div className="section-kicker"><ShieldCheck size={16} /> Survey components</div>
        <div className="component-grid">
          <label className="check-row component-toggle">
            <input type="checkbox" checked={settings.airportLocationMode} onChange={(event) => updateSetting('airportLocationMode', event.target.checked)} />
            <span>
              <strong>Airport terminal location flow</strong>
              <small>Terminal, movement, and survey point branching.</small>
            </span>
          </label>
          <label className="check-row component-toggle">
            <input type="checkbox" checked={settings.captureGps} onChange={(event) => updateSetting('captureGps', event.target.checked)} />
            <span>
              <strong>GPS coordinates</strong>
              <small>Capture latitude, longitude, and accuracy when browser permission is allowed.</small>
            </span>
          </label>
          <label className="check-row component-toggle">
            <input type="checkbox" checked={settings.captureAudio} onChange={(event) => updateSetting('captureAudio', event.target.checked)} />
            <span>
              <strong>Audio recording</strong>
              <small>Attach a compressed browser audio recording to each response.</small>
            </span>
          </label>
          <label className="check-row component-toggle">
            <input type="checkbox" checked={settings.showRespondentPhone} onChange={(event) => updateSetting('showRespondentPhone', event.target.checked)} />
            <span>
              <strong>Respondent phone field</strong>
              <small>Show or hide phone collection for this project.</small>
            </span>
          </label>
          <label className="check-row component-toggle">
            <input type="checkbox" checked={settings.showHouseholdId} onChange={(event) => updateSetting('showHouseholdId', event.target.checked)} />
            <span>
              <strong>Household ID field</strong>
              <small>Use only for household surveys where an ID is required.</small>
            </span>
          </label>
        </div>
      </div>

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

function ClientAccessManager({ clients, projects, editingClient, onStartNew, onEdit, onChange, onCancel, onSave }) {
  function update(field, value) {
    onChange({ ...editingClient, [field]: value });
  }

  function toggleProject(projectId) {
    const current = new Set(editingClient.projectIds || []);
    if (current.has(projectId)) current.delete(projectId);
    else current.add(projectId);
    update('projectIds', [...current]);
  }

  return (
    <div className="panel client-admin-panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">Client Access</p>
          <h2>Client logins and project visibility</h2>
        </div>
        <button className="primary" onClick={onStartNew}><Plus size={18} /> New Client</button>
      </div>

      {editingClient && (
        <div className="client-editor">
          <div className="inline-grid">
            <label>
              Display name
              <input value={editingClient.displayName} onChange={(event) => update('displayName', event.target.value)} />
            </label>
            <label>
              Username
              <input value={editingClient.username} onChange={(event) => update('username', event.target.value)} />
            </label>
          </div>
          <label>
            Password {editingClient.id && <span className="hint-text">leave blank to keep existing password</span>}
            <input type="password" value={editingClient.password || ''} onChange={(event) => update('password', event.target.value)} />
          </label>
          <div className="project-check-list">
            {projects.map((project) => (
              <label className="check-row" key={project.id}>
                <input
                  type="checkbox"
                  checked={(editingClient.projectIds || []).includes(project.id)}
                  onChange={() => toggleProject(project.id)}
                />
                {project.name}
              </label>
            ))}
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
        {clients.length === 0 && <p className="empty">No client logins yet.</p>}
        {clients.map((client) => (
          <button className="client-list-row" key={client.id} onClick={() => onEdit(client)}>
            <span>
              <strong>{client.displayName}</strong>
              <small>{client.username} · {client.isActive ? 'Active' : 'Inactive'}</small>
            </span>
            <em>{client.projectIds.length} project{client.projectIds.length === 1 ? '' : 's'}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResponseEditor({ response, project, onChange, onCancel, onSave, onDownloadAudio, audioPreview }) {
  function update(field, value) {
    onChange({ ...response, [field]: value });
  }

  function updateAnswer(questionId, value) {
    onChange({
      ...response,
      answers: deriveAnswers({ ...response.answers, [questionId]: value })
    });
  }

  function autoClean() {
    onChange({
      ...response,
      answers: autoCleanAnswers(response.answers, project?.questions || [])
    });
  }

  return (
    <div className="panel response-editor">
      <div className="section-title">
        <div>
          <p className="eyebrow">Review Submission</p>
          <h2>Response #{response.id}</h2>
          <p>Submitted {new Date(response.submittedAt).toLocaleString()}</p>
        </div>
        <div className="actions">
          {response.hasAudio && (
            <button className="download audio-download" onClick={() => onDownloadAudio(response.id)}>
              <Download size={16} /> Audio
            </button>
          )}
          <button className="secondary" onClick={autoClean}><RefreshCw size={18} /> Auto-clean</button>
          <button className="secondary" onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={() => onSave(response)}><Save size={18} /> Save Response</button>
        </div>
      </div>

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
          <input value={response.enumeratorName} onChange={(event) => update('enumeratorName', event.target.value)} />
        </label>
        <label>
          Location
          <select value={response.location} onChange={(event) => update('location', event.target.value)}>
            {(project?.locations || []).map((location) => <option key={location}>{location}</option>)}
          </select>
        </label>
      </div>

      <div className="inline-grid">
        <label>
          Respondent name
          <input value={response.respondentName || ''} onChange={(event) => update('respondentName', event.target.value)} />
        </label>
        <label>
          Respondent phone
          <input value={response.respondentPhone || ''} onChange={(event) => update('respondentPhone', event.target.value)} />
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
            />
          ))}
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

function RecentTable({ rows, loading, onReview }) {
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
              <th>Review</th>
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
                <td><button className="secondary compact-button" onClick={() => onReview(row.id)}>Review</button></td>
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

function Breakdown({ title, rows, labelKey, valueKey, className = '' }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey])), 1);
  return (
    <div className={`panel breakdown ${className}`.trim()}>
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
