import { useEffect, useMemo, useRef, useState } from 'react';
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
  Mic,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  UserRound
} from 'lucide-react';

const apiBase = import.meta.env.VITE_API_BASE || '';
const blankQuestion = { id: '', label: '', type: 'text', options: '', required: false };
const airportPrefix = 'Kempegowda International Airport - ';
const defaultProjectSlug = 'bengaluru-second-airport-feasibility';
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
  const publicSlug = isPublicSurvey ? route.replace('/p/', '') : defaultProjectSlug;

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
          <button className={route.startsWith('/client') || route === '/' ? 'active' : ''} onClick={() => navigate('/client')}>Client</button>
          <button className={route.startsWith('/admin') ? 'active' : ''} onClick={() => navigate('/admin')}>Admin</button>
        </nav>
      </header>
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
  const [enumeratorStats, setEnumeratorStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [audio, setAudio] = useState(null);
  const [audioStatus, setAudioStatus] = useState('No recording');
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const audioRef = useRef(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAnswer(questionId, value) {
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

  function captureGps(questions = config.questions || []) {
    if (!navigator.geolocation) {
      setGpsStatus('GPS is not supported on this device.');
      return;
    }
    setGpsStatus('Capturing GPS...');
    const applyPosition = (position, label = 'Captured') => {
      const nextGps = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      setGps(nextGps);
      if (questions.some((question) => question.id === 'google_coordinates')) {
        updateAnswer('google_coordinates', `${nextGps.latitude.toFixed(6)}, ${nextGps.longitude.toFixed(6)}`);
      }
      setGpsStatus(`${label} within ${Math.round(position.coords.accuracy)}m`);
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyPosition(position, 'Captured');
        navigator.geolocation.getCurrentPosition(
          (freshPosition) => applyPosition(freshPosition, 'Updated'),
          () => {},
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
        );
      },
      () => {
        setGpsStatus('GPS slow. You can continue or tap GPS again.');
        navigator.geolocation.getCurrentPosition(
          (position) => applyPosition(position, 'Captured'),
          () => setGpsStatus('GPS unavailable. Continue or tap GPS again.'),
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
        );
      },
      { enableHighAccuracy: false, timeout: 2500, maximumAge: 900000 }
    );
  }

  async function startAudioRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setAudioStatus('Audio recording is not supported on this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const nextAudio = {
          dataUrl: await blobToDataUrl(blob),
          mimeType: blob.type,
          size: blob.size
        };
        audioRef.current = nextAudio;
        setAudio(nextAudio);
        setAudioStatus(`Recorded ${formatBytes(blob.size)}`);
        setMediaRecorder(null);
      };
      recorder.start();
      setMediaRecorder(recorder);
      audioRef.current = null;
      setAudio(null);
      setAudioStatus('Recording...');
    } catch {
      setAudioStatus('Microphone permission denied or unavailable.');
    }
  }

  function stopAudioRecording() {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
  }

  function finalizeAudioRecording() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return Promise.resolve(audio);
    setAudioStatus('Stopping recording...');
    return new Promise((resolve) => {
      const recorder = mediaRecorder;
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
    setAudio(null);
    setAudioStatus('No recording');
  }

  function resetAfterSubmit() {
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
    clearAudio();
  }

  async function sendSubmission(payload) {
    const response = await fetch(`${apiBase}/api/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || 'Unable to submit survey.');
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
    const finalAudio = await finalizeAudioRecording();
    const submissionPayload = {
      ...form,
      projectSlug,
      gps,
      audio: finalAudio,
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

          <div className="gps-row audio-row">
            <div>
              <strong>Audio recording</strong>
              <span>{audioStatus}</span>
            </div>
            <div className="audio-actions">
              {!mediaRecorder && (
                <button type="button" className="icon-button" onClick={startAudioRecording} aria-label="Start audio recording">
                  <Mic size={18} />
                </button>
              )}
              {mediaRecorder && (
                <button type="button" className="icon-button danger-button" onClick={stopAudioRecording} aria-label="Stop audio recording">
                  <Square size={18} />
                </button>
              )}
              {audio && (
                <button type="button" className="icon-button" onClick={clearAudio} aria-label="Clear audio recording">
                  <Trash2 size={18} />
                </button>
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
            {saving ? 'Submitting...' : mediaRecorder ? 'Stop recording and submit' : 'Submit Survey'}
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

function SurveyLocationInput({ locations, value, onChange }) {
  const [draftTerminal, setDraftTerminal] = useState('');
  const [draftMovement, setDraftMovement] = useState('');
  const airportLocations = locations
    .filter((location) => location.startsWith(airportPrefix))
    .map((location) => {
      const [, terminal, movement, point] = location.match(/Terminal ([12]) - (Departures|Arrivals) - (.+)$/) || [];
      if (terminal && movement && point) return { location, terminal: `Terminal ${terminal}`, movement, point };
      const [, oldTerminal, oldPoint] = location.match(/Terminal ([12]) - (.+)$/) || [];
      return { location, terminal: oldTerminal ? `Terminal ${oldTerminal}` : '', movement: oldPoint || '', point: oldPoint || '' };
    })
    .filter((item) => item.terminal && item.movement && item.point);
  const selected = airportLocations.find((item) => item.location === value);

  useEffect(() => {
    if (selected) {
      setDraftTerminal(selected.terminal);
      setDraftMovement(selected.movement);
    }
  }, [selected?.location]);

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

  const terminals = [...new Set(airportLocations.map((item) => item.terminal))];
  const terminal = selected?.terminal || draftTerminal;
  const movement = selected?.movement || draftMovement;
  const movements = [...new Set(airportLocations.filter((item) => item.terminal === terminal).map((item) => item.movement))];
  const points = airportLocations.filter((item) => item.terminal === terminal && item.movement === movement);

  return (
    <div className="location-grid">
      <label>
        Airport terminal
        <select
          value={terminal}
          onChange={(event) => {
            setDraftTerminal(event.target.value);
            setDraftMovement('');
            onChange('');
          }}
          required
        >
          <option value="">Select terminal</option>
          {terminals.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        Movement
        <select
          value={movement}
          onChange={(event) => {
            setDraftMovement(event.target.value);
            onChange('');
          }}
          required
          disabled={!terminal}
        >
          <option value="">Select movement</option>
          {movements.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        Survey point
        <select
          value={selected?.point || ''}
          onChange={(event) => {
            const next = airportLocations.find((item) => item.terminal === terminal && item.movement === movement && item.point === event.target.value);
            onChange(next?.location || '');
          }}
          required
          disabled={!terminal || !movement}
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

function ClientDashboard({ token, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const authHeaders = { Authorization: `Bearer ${token}` };
  const selectedProject = projects.find((project) => project.id === selectedId) || projects[0];

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

  function changeSelectedProject(projectId) {
    const emptyFilters = { enumerator: '', location: '', dateFrom: '', dateTo: '' };
    setSelectedId(projectId);
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [queryString]);

  return (
    <section className="dashboard client-dashboard">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Client View</p>
          <h2>Collection Dashboard</h2>
          <p>{selectedProject ? selectedProject.name : 'Survey progress'}</p>
        </div>
        <button className="secondary" onClick={onLogout}>Logout</button>
      </div>

      <div className="panel client-filter-bar">
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
        <button className="icon-button" onClick={loadDashboard} aria-label="Refresh client dashboard"><RefreshCw size={18} /></button>
      </div>

      <div className="metric-grid">
        <Metric icon={<ClipboardList size={19} />} label="Total samples" value={data?.totals?.total_samples ?? 0} />
        <Metric icon={<CalendarClock size={19} />} label="Samples today" value={data?.totals?.samples_today ?? 0} />
        <Metric icon={<MapPin size={19} />} label="Terminals" value={data?.byTerminal?.length ?? 0} />
        <Metric icon={<BarChart3 size={19} />} label="Survey points" value={data?.bySurveyPoint?.length ?? 0} />
      </div>

      <div className="chart-grid client-chart-grid">
        <Breakdown title="Samples by date" rows={data?.byDate || []} labelKey="date" valueKey="samples" />
        <Breakdown title="Samples by terminal" rows={data?.byTerminal || []} labelKey="terminal" valueKey="samples" />
        <Breakdown title="Samples by departures / arrivals" rows={data?.byMovement || []} labelKey="movement" valueKey="samples" />
        <Breakdown title="Samples by survey point" rows={data?.bySurveyPoint || []} labelKey="survey_point" valueKey="samples" />
        <Breakdown title="Samples by location" rows={data?.byLocation || []} labelKey="location" valueKey="samples" />
      </div>

      {loading && <p className="status">Refreshing dashboard...</p>}
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
  const [clients, setClients] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ enumerators: [], locations: [] });
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [editingResponse, setEditingResponse] = useState(null);
  const [filters, setFilters] = useState({ enumerator: '', location: '', dateFrom: '', dateTo: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const selectedProject = projects.find((project) => project.id === selectedId) || projects[0];
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
    anchor.download = `vtrac-response-${responseId}-audio.webm`;
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

      <div className="panel filters">
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
          <button className="download" onClick={() => download('csv')}><Download size={16} /> CSV</button>
          <button className="download" onClick={() => download('xlsx')}><Download size={16} /> Excel</button>
        </div>
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

      <RecentTable rows={data?.recent || []} loading={loading} onReview={reviewResponse} />
      {editingResponse && (
        <ResponseEditor
          response={editingResponse}
          project={selectedProject}
          onChange={setEditingResponse}
          onCancel={() => setEditingResponse(null)}
          onSave={saveResponse}
          onDownloadAudio={downloadAudio}
        />
      )}
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

function ResponseEditor({ response, project, onChange, onCancel, onSave, onDownloadAudio }) {
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
              <th>Audio</th>
              <th>GPS</th>
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
                <td>{row.audio_mime_type ? 'Yes' : '-'}</td>
                <td>{row.latitude && row.longitude ? `${row.latitude}, ${row.longitude}` : '-'}</td>
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
