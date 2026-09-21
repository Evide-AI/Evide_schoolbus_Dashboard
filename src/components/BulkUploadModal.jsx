import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/browser';
import { supabase } from '../lib/supabase';
import { regenerateBusRoute } from '../lib/api';
import { rowsToRecords, validateRecords, normBusNumber, templateCsv } from '../lib/studentImport';
import Modal from './Modal';

const CHUNK = 200;
const MAX_ROWS = 3000;

function readCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: 'greedy',
      complete: (res) => resolve(res.data),
      error: reject,
    });
  });
}

async function readFileRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return readCsv(file);
  if (name.endsWith('.xlsx')) return readSheet(file);
  if (name.endsWith('.xls')) {
    throw new Error('Old .xls files are not supported. In Excel, use File → Save As → Excel Workbook (.xlsx) or CSV, then upload again.');
  }
  throw new Error('Please upload a .xlsx or .csv file.');
}

// Bulk student import.
// - From a bus page: pass busId (+ busNumber). Every student goes onto that bus.
// - From the Students page: omit busId. The user picks a bus for everyone,
//   uses the "Bus" column from the file, or leaves students unassigned.
export default function BulkUploadModal({ schoolId, busId = null, busNumber = null, onClose, onImported }) {
  const fixedBus = Boolean(busId);

  const [step, setStep] = useState('pick'); // pick | preview | importing | done
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null); // { records, hasBusColumn, hasCoordColumns }
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(false);

  // School data used for validation
  const [buses, setBuses] = useState([]);
  const [existingAdmissions, setExistingAdmissions] = useState(new Set());
  const [countsByBus, setCountsByBus] = useState({});
  const [schoolLoaded, setSchoolLoaded] = useState(false);

  // Where the students go when importing from the Students page:
  // 'column' | 'none' | <bus id>
  const [target, setTarget] = useState('none');

  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null); // { imported, failed: [{rowNumber, name, reason}] }

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: b, error: e1 }, { data: s, error: e2 }] = await Promise.all([
        supabase.from('buses').select('id, bus_number, seat_capacity').eq('school_id', schoolId).order('bus_number'),
        supabase.from('students').select('admission_number, bus_id').eq('school_id', schoolId),
      ]);
      if (!active) return;
      if (e1 || e2) { setError((e1 || e2).message); return; }
      const counts = {};
      for (const st of s || []) if (st.bus_id) counts[st.bus_id] = (counts[st.bus_id] || 0) + 1;
      setBuses(b || []);
      setExistingAdmissions(new Set((s || []).map((st) => String(st.admission_number).toLowerCase())));
      setCountsByBus(counts);
      setSchoolLoaded(true);
    })();
    return () => { active = false; };
  }, [schoolId]);

  const busesByNumber = useMemo(() => {
    const m = new Map();
    for (const b of buses) m.set(normBusNumber(b.bus_number), b.id);
    return m;
  }, [buses]);

  const busMode = fixedBus ? 'fixed' : target === 'column' ? 'column' : target === 'none' ? 'none' : 'fixed';
  const fixedBusId = fixedBus ? busId : (busMode === 'fixed' ? target : null);

  const validated = useMemo(() => {
    if (!parsed || !schoolLoaded) return [];
    return validateRecords(parsed.records, { existingAdmissions, busesByNumber, busMode, fixedBusId });
  }, [parsed, schoolLoaded, existingAdmissions, busesByNumber, busMode, fixedBusId]);

  const ready = validated.filter((r) => r.ok);
  const problems = validated.filter((r) => !r.ok);
  const missingLocations = ready.filter((r) => !r.hasLocations).length;

  // Seat-capacity warning (a warning only — the import still goes ahead).
  const capacityWarnings = useMemo(() => {
    const adding = {};
    for (const r of ready) if (r.payload.bus_id) adding[r.payload.bus_id] = (adding[r.payload.bus_id] || 0) + 1;
    return Object.entries(adding).flatMap(([id, n]) => {
      const bus = buses.find((b) => b.id === id);
      if (!bus?.seat_capacity) return [];
      const total = (countsByBus[id] || 0) + n;
      return total > bus.seat_capacity ? [`${bus.bus_number} will have ${total} students for ${bus.seat_capacity} seats`] : [];
    });
  }, [ready, buses, countsByBus]);

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setReading(true);
    setFileName(file.name);
    try {
      const rows = await readFileRows(file);
      const res = rowsToRecords(rows);
      if (res.error) throw new Error(res.error);
      if (res.records.length === 0) throw new Error('The file has a header row but no students under it.');
      if (res.records.length > MAX_ROWS) throw new Error(`The file has ${res.records.length} rows. Please split it into files of up to ${MAX_ROWS} students.`);
      setParsed(res);
      if (!fixedBus) setTarget(res.hasBusColumn ? 'column' : 'none');
      setStep('preview');
    } catch (ex) {
      setError(ex.message || 'Could not read this file.');
      setParsed(null);
      setStep('pick');
    } finally {
      setReading(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evide-students-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function insertRows(rows) {
    const payloads = rows.map((r) => ({ ...r.payload, school_id: schoolId }));
    const { error: err } = await supabase.from('students').insert(payloads);
    if (!err) return { imported: rows.length, failed: [] };

    // The batch failed as a whole (e.g. someone added a student with the same
    // admission number meanwhile). Retry one by one so the good rows still go in.
    let imported = 0;
    const failed = [];
    for (const r of rows) {
      const { error: e1 } = await supabase.from('students').insert({ ...r.payload, school_id: schoolId });
      if (e1) {
        failed.push({
          rowNumber: r.rowNumber,
          name: r.full_name,
          reason: e1.code === '23505' ? 'Admission number already exists in your school' : e1.message,
        });
      } else {
        imported++;
      }
    }
    return { imported, failed };
  }

  async function runImport() {
    setStep('importing');
    setProgress({ done: 0, total: ready.length });
    let imported = 0;
    const failed = [];
    for (let i = 0; i < ready.length; i += CHUNK) {
      const chunk = ready.slice(i, i + CHUNK);
      const res = await insertRows(chunk);
      imported += res.imported;
      failed.push(...res.failed);
      setProgress({ done: Math.min(i + CHUNK, ready.length), total: ready.length });
    }

    // Rebuild routes for every bus that got new students (best-effort).
    const touched = new Set(ready.map((r) => r.payload.bus_id).filter(Boolean));
    touched.forEach((id) => regenerateBusRoute(id));

    setResult({ imported, failed });
    setStep('done');
  }

  function finish() {
    if (result?.imported > 0) onImported?.();
    else onClose();
  }

  const title = fixedBus ? `Import students to ${busNumber || 'this bus'}` : 'Import students';

  return (
    <Modal title={title} onClose={step === 'importing' ? () => {} : (result?.imported ? finish : onClose)} width={600}>
      {error && <div className="form-error">{error}</div>}

      {step === 'pick' && (
        <>
          <p className="muted bulk-intro">
            Upload a .xlsx or .csv file with one student per row. You'll see a check of every row before anything is saved.
          </p>

          <label className={`bulk-drop ${reading ? 'is-busy' : ''}`} htmlFor="bulk-file">
            <div className="bulk-drop-icon">⬆</div>
            <div className="bulk-drop-text">
              {reading ? 'Reading file…' : fileName ? <strong>{fileName}</strong> : 'Choose a spreadsheet file'}
            </div>
            <div className="muted bulk-drop-hint">.xlsx or .csv</div>
            <input id="bulk-file" type="file" accept=".xlsx,.csv,.xls" style={{ display: 'none' }}
              onChange={onPickFile} disabled={reading} />
          </label>

          <div className="bulk-columns">
            <div className="bulk-columns-label muted">Columns</div>
            <code>
              Name, Admission Number{fixedBus ? '' : ', Bus'}, Pickup Lat, Pickup Lng, Drop Lat, Drop Lng
            </code>
            <p className="muted form-hint">
              Name and Admission Number are required. Locations can be added later.
              {fixedBus ? ' Everyone in the file is added to this bus; a Bus column, if present, is ignored.' : ' Bus is optional — match it to the bus numbers in your fleet.'}
            </p>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>Download template</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </>
      )}

      {step === 'preview' && (
        <>
          <div className="bulk-file-row">
            <span className="bulk-file-name">{fileName}</span>
            <label className="linklike" htmlFor="bulk-file-again">Choose another file</label>
            <input id="bulk-file-again" type="file" accept=".xlsx,.csv,.xls" style={{ display: 'none' }} onChange={onPickFile} />
          </div>

          {!fixedBus && (
            <div className="form-field">
              <label htmlFor="bulk-target">Assign to bus</label>
              <select id="bulk-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                {parsed?.hasBusColumn && <option value="column">Use the Bus column in the file</option>}
                <option value="none">Leave unassigned (assign later)</option>
                {buses.map((b) => <option key={b.id} value={b.id}>All to {b.bus_number}</option>)}
              </select>
            </div>
          )}

          {!schoolLoaded ? (
            <div className="muted loading-row">Checking against your school…</div>
          ) : (
            <>
              <div className="bulk-summary">
                <div className="bulk-stat bulk-stat-ok">
                  <span className="bulk-stat-num">{ready.length}</span>
                  <span className="bulk-stat-label">ready to import</span>
                </div>
                <div className={`bulk-stat ${problems.length ? 'bulk-stat-bad' : ''}`}>
                  <span className="bulk-stat-num">{problems.length}</span>
                  <span className="bulk-stat-label">need fixing</span>
                </div>
              </div>

              {missingLocations > 0 && (
                <p className="bulk-note">
                  {missingLocations} student{missingLocations === 1 ? ' has' : 's have'} no pickup or drop location.
                  They'll be imported, but won't appear on the bus route until you add locations.
                </p>
              )}
              {capacityWarnings.map((w) => <p className="bulk-note bulk-note-warn" key={w}>{w}.</p>)}

              {problems.length > 0 && (
                <div className="bulk-problems">
                  <div className="bulk-problems-head">
                    These rows will be skipped. Fix them in the file and upload again, or import the rest now.
                  </div>
                  <ul>
                    {problems.slice(0, 50).map((r) => (
                      <li key={r.rowNumber}>
                        <span className="bulk-problem-row">Row {r.rowNumber}</span>
                        <span className="bulk-problem-text">
                          {r.full_name || r.admission_number ? <strong>{r.full_name || r.admission_number}: </strong> : null}
                          {r.problems.join('; ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {problems.length > 50 && <div className="muted bulk-more">…and {problems.length - 50} more</div>}
                </div>
              )}
            </>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={runImport}
              disabled={!schoolLoaded || ready.length === 0}>
              Import {ready.length} student{ready.length === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}

      {step === 'importing' && (
        <div className="bulk-progress">
          <p>Importing {progress.done} of {progress.total}…</p>
          <div className="capacity-bar">
            <div className="capacity-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="muted form-hint">Keep this window open until it finishes.</p>
        </div>
      )}

      {step === 'done' && result && (
        <>
          <p className="notify-sent">
            {result.imported > 0
              ? <>Imported <strong>{result.imported}</strong> student{result.imported === 1 ? '' : 's'}.</>
              : 'No students were imported.'}
            {problems.length > 0 && ` ${problems.length} row${problems.length === 1 ? ' was' : 's were'} skipped because of errors in the file.`}
          </p>
          {result.failed.length > 0 && (
            <div className="bulk-problems">
              <div className="bulk-problems-head">These rows could not be saved:</div>
              <ul>
                {result.failed.map((f) => (
                  <li key={f.rowNumber}>
                    <span className="bulk-problem-row">Row {f.rowNumber}</span>
                    <span className="bulk-problem-text"><strong>{f.name}: </strong>{f.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={finish}>Done</button>
          </div>
        </>
      )}
    </Modal>
  );
}
