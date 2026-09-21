// Parsing + validation for bulk student import. Kept free of React and Supabase
// so it can be tested on its own.

// Header aliases, compared after lowercasing and stripping everything that
// isn't a letter or digit ("Admission No." -> "admissionno").
const HEADER_ALIASES = {
  full_name: ['name', 'fullname', 'studentname', 'student', 'nameofstudent'],
  admission_number: ['admissionnumber', 'admissionno', 'admno', 'admission', 'admnno', 'admnnumber', 'admissionnum'],
  bus: ['bus', 'busnumber', 'busno', 'vehicle', 'vehiclenumber', 'vehicleno', 'busregistration', 'registrationnumber'],
  pickup_lat: ['pickuplat', 'pickuplatitude'],
  pickup_lng: ['pickuplng', 'pickuplong', 'pickuplon', 'pickuplongitude'],
  drop_lat: ['droplat', 'droplatitude'],
  drop_lng: ['droplng', 'droplong', 'droplon', 'droplongitude'],
};

export const TEMPLATE_HEADERS = ['Name', 'Admission Number', 'Bus', 'Pickup Lat', 'Pickup Lng', 'Drop Lat', 'Drop Lng'];

function normHeader(v) {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Bus numbers are compared without spaces/dashes and case-insensitively, so
// "kl 10 aa-1111" matches "KL10AA1111".
export function normBusNumber(v) {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

function isEmptyRow(row) {
  return !row || row.every((c) => cellText(c) === '');
}

function mapHeaders(row) {
  const map = {};
  row.forEach((cell, idx) => {
    const h = normHeader(cell);
    if (!h) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && aliases.includes(h)) { map[field] = idx; break; }
    }
  });
  return map;
}

// rows: array of arrays (from CSV or xlsx). Finds the header row within the
// first 10 non-empty rows and turns the rest into plain records.
export function rowsToRecords(rows) {
  let headerIdx = -1;
  let colMap = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (isEmptyRow(rows[i])) continue;
    const m = mapHeaders(rows[i]);
    if (m.full_name !== undefined && m.admission_number !== undefined) {
      headerIdx = i; colMap = m; break;
    }
  }

  if (headerIdx === -1) {
    return {
      error: 'Could not find the header row. The file needs at least a "Name" column and an "Admission Number" column.',
      records: [],
      hasBusColumn: false,
      hasCoordColumns: false,
    };
  }

  const records = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isEmptyRow(row)) continue;
    const get = (field) => (colMap[field] === undefined ? '' : cellText(row[colMap[field]]));
    records.push({
      rowNumber: i + 1, // spreadsheet row number, as the user sees it
      full_name: get('full_name').replace(/\s+/g, ' '),
      admission_number: get('admission_number'),
      bus: get('bus'),
      pickup_lat: get('pickup_lat'),
      pickup_lng: get('pickup_lng'),
      drop_lat: get('drop_lat'),
      drop_lng: get('drop_lng'),
    });
  }

  return {
    error: null,
    records,
    hasBusColumn: colMap.bus !== undefined,
    hasCoordColumns: ['pickup_lat', 'pickup_lng', 'drop_lat', 'drop_lng'].some((f) => colMap[f] !== undefined),
  };
}

function parseCoord(text, min, max) {
  if (text === '') return { value: null, ok: true };
  const n = Number(text);
  if (!Number.isFinite(n) || n < min || n > max) return { value: null, ok: false };
  return { value: n, ok: true };
}

// Validates records and resolves each to an insert payload.
// options:
//   existingAdmissions: Set of admission numbers already in the school (normalised lowercase)
//   busesByNumber: Map normBusNumber -> bus id
//   busMode: 'fixed' | 'column' | 'none'
//   fixedBusId: bus id used when busMode === 'fixed'
export function validateRecords(records, { existingAdmissions, busesByNumber, busMode, fixedBusId }) {
  const seen = new Map(); // admission (lowercase) -> first row number
  return records.map((r) => {
    const problems = [];

    if (!r.full_name) problems.push('Name is empty');
    if (!r.admission_number) problems.push('Admission number is empty');

    const admKey = r.admission_number.toLowerCase();
    if (r.admission_number) {
      if (existingAdmissions.has(admKey)) {
        problems.push('Admission number already exists in your school');
      } else if (seen.has(admKey)) {
        problems.push(`Same admission number as row ${seen.get(admKey)}`);
      } else {
        seen.set(admKey, r.rowNumber);
      }
    }

    const pLat = parseCoord(r.pickup_lat, -90, 90);
    const pLng = parseCoord(r.pickup_lng, -180, 180);
    const dLat = parseCoord(r.drop_lat, -90, 90);
    const dLng = parseCoord(r.drop_lng, -180, 180);
    if (!pLat.ok || !pLng.ok) problems.push('Pickup location is not a valid latitude/longitude');
    else if ((pLat.value === null) !== (pLng.value === null)) problems.push('Pickup needs both latitude and longitude');
    if (!dLat.ok || !dLng.ok) problems.push('Drop location is not a valid latitude/longitude');
    else if ((dLat.value === null) !== (dLng.value === null)) problems.push('Drop needs both latitude and longitude');

    let busId = null;
    if (busMode === 'fixed') {
      busId = fixedBusId;
    } else if (busMode === 'column' && r.bus) {
      busId = busesByNumber.get(normBusNumber(r.bus)) || null;
      if (!busId) problems.push(`Bus "${r.bus}" is not in your fleet`);
    }

    return {
      ...r,
      problems,
      ok: problems.length === 0,
      hasLocations: pLat.value !== null && dLat.value !== null,
      payload: {
        full_name: r.full_name,
        admission_number: r.admission_number,
        pickup_lat: pLat.value,
        pickup_lng: pLng.value,
        drop_lat: dLat.value,
        drop_lng: dLng.value,
        bus_id: busId,
      },
    };
  });
}

export function templateCsv() {
  const example = ['Anjali Menon', '1024', 'KL10AA1111', '10.9512', '76.0211', '10.9650', '76.0400'];
  return `${TEMPLATE_HEADERS.join(',')}\n${example.join(',')}\n`;
}
