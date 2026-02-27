const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

function parseLocationId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeEquipment(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toWkt(point) {
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
  return `POINT(${point.longitude} ${point.latitude})`;
}

function parseWktPoint(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/POINT\s*\(\s*([-\d.Ee+]+)\s+([-\d.Ee+]+)\s*\)/);
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { latitude: lat, longitude: lon };
}

function parseEwkbHexPoint(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 50 || hex.length % 2 !== 0) return null;

  const buffer = Buffer.from(hex, 'hex');
  if (buffer.length < 25) return null;

  const littleEndian = buffer.readUInt8(0) === 1;
  const readUInt32 = (offset) => (littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset));
  const readDouble = (offset) => (littleEndian ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset));

  const geometryType = readUInt32(1);
  const hasSrid = (geometryType & 0x20000000) !== 0;
  const typeCode = geometryType & 0xff;
  if (typeCode !== 1) return null; // POINT

  const offset = hasSrid ? 9 : 5;
  if (buffer.length < offset + 16) return null;
  const longitude = readDouble(offset);
  const latitude = readDouble(offset + 8);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function parseGeoData(value) {
  return parseWktPoint(value) || parseEwkbHexPoint(value);
}

function toApiLocationRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description || null,
    geo_data: row.geo_data || null,
    equipment: typeof row.equipment === 'string' ? row.equipment : '',
    current_location: row.current_location === true,
    created_at: row.created_at || null
  };
}

function haversineDistanceMeters(a, b) {
  const toRad = deg => (deg * Math.PI) / 180;
  const earthRadiusM = 6371000;

  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function listLocations(userId) {
  let data;
  let error;

  ({ data, error } = await supabase
    .from('user_locations')
    .select('id, user_id, name, description, equipment, current_location, created_at, geo_data:ST_AsText(geo_data)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true }));

  if (error) {
    ({ data, error } = await supabase
      .from('user_locations')
      .select('id, user_id, name, description, equipment, current_location, created_at, geo_data')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }));
  }

  if (error) throw error;
  return (data || []).map(toApiLocationRow);
}

async function clearCurrentLocation(userId) {
  const { error } = await supabase
    .from('user_locations')
    .update({ current_location: false })
    .eq('user_id', userId);
  if (error) throw error;
}

async function createLocation(userId, payload = {}) {
  const name = String(payload.name || '').trim();
  if (!name) {
    const err = new Error('name is required');
    err.statusCode = 422;
    throw err;
  }

  const currentLocation = payload.current_location === true;
  if (currentLocation) {
    await clearCurrentLocation(userId);
  }

  const insert = {
    user_id: userId,
    name,
    description: typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : null,
    equipment: sanitizeEquipment(payload.equipment),
    current_location: currentLocation,
    geo_data: typeof payload.geo_data === 'string' && payload.geo_data.trim()
      ? payload.geo_data.trim()
      : toWkt(payload.geo_data)
  };

  const { data, error } = await supabase
    .from('user_locations')
    .insert(insert)
    .select('id, user_id, name, description, equipment, current_location, created_at, geo_data')
    .single();

  if (error) throw error;
  return toApiLocationRow(data);
}

async function updateLocation(userId, locationId, payload = {}) {
  const id = parseLocationId(locationId);
  if (!id) {
    const err = new Error('location_id must be a positive integer');
    err.statusCode = 422;
    throw err;
  }

  const { data: existing, error: existingError } = await supabase
    .from('user_locations')
    .select('id, user_id, current_location')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) {
    const err = new Error('Location not found');
    err.statusCode = 404;
    throw err;
  }

  const update = {};
  if (payload.name !== undefined) {
    const name = String(payload.name || '').trim();
    if (!name) {
      const err = new Error('name cannot be empty');
      err.statusCode = 422;
      throw err;
    }
    update.name = name;
  }
  if (payload.description !== undefined) {
    update.description = typeof payload.description === 'string' && payload.description.trim()
      ? payload.description.trim()
      : null;
  }
  if (payload.equipment !== undefined) {
    update.equipment = sanitizeEquipment(payload.equipment);
  }
  if (payload.geo_data !== undefined) {
    update.geo_data = typeof payload.geo_data === 'string' && payload.geo_data.trim()
      ? payload.geo_data.trim()
      : toWkt(payload.geo_data);
  }
  if (payload.current_location !== undefined) {
    update.current_location = payload.current_location === true;
  }

  if (update.current_location === true) {
    await clearCurrentLocation(userId);
  }

  if (Object.keys(update).length === 0) {
    const { data, error } = await supabase
      .from('user_locations')
      .select('id, user_id, name, description, equipment, current_location, created_at, geo_data')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return toApiLocationRow(data);
  }

  const { data, error } = await supabase
    .from('user_locations')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, user_id, name, description, equipment, current_location, created_at, geo_data')
    .single();

  if (error) throw error;
  return toApiLocationRow(data);
}

async function deleteLocation(userId, locationId) {
  const id = parseLocationId(locationId);
  if (!id) {
    const err = new Error('location_id must be a positive integer');
    err.statusCode = 422;
    throw err;
  }

  const { error } = await supabase
    .from('user_locations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

async function setCurrentLocation({ userId, locationId, locationName }) {
  let targetLocation = null;

  const parsedId = parseLocationId(locationId);
  if (parsedId) {
    const { data, error } = await supabase
      .from('user_locations')
      .select('id, user_id, name, description, equipment, current_location, created_at, geo_data')
      .eq('id', parsedId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    targetLocation = data || null;
  } else if (typeof locationName === 'string' && locationName.trim()) {
    const { data, error } = await supabase
      .from('user_locations')
      .select('id, user_id, name, description, equipment, current_location, created_at, geo_data')
      .eq('user_id', userId)
      .ilike('name', locationName.trim());
    if (error) throw error;
    if (!data || data.length === 0) {
      const err = new Error(`Location "${locationName}" not found`);
      err.statusCode = 404;
      throw err;
    }
    if (data.length > 1) {
      const err = new Error(`Multiple locations match "${locationName}". Use location_id.`);
      err.statusCode = 422;
      err.matches = data.map(row => ({ id: row.id, name: row.name }));
      throw err;
    }
    targetLocation = data[0];
  } else {
    const err = new Error('Either location_id or location_name is required');
    err.statusCode = 422;
    throw err;
  }

  if (!targetLocation) {
    const err = new Error('Location not found');
    err.statusCode = 404;
    throw err;
  }

  if (targetLocation.current_location === true) {
    return toApiLocationRow(targetLocation);
  }

  await clearCurrentLocation(userId);

  const { data: updated, error: updateError } = await supabase
    .from('user_locations')
    .update({ current_location: true })
    .eq('id', targetLocation.id)
    .eq('user_id', userId)
    .select('id, user_id, name, description, equipment, current_location, created_at, geo_data')
    .single();

  if (updateError) throw updateError;
  return toApiLocationRow(updated);
}

async function resolveNearestLocation(userId, { latitude, longitude, radius_m = 500 }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const err = new Error('latitude and longitude are required');
    err.statusCode = 422;
    throw err;
  }

  const radius = Number.isFinite(Number(radius_m)) ? Math.max(1, Number(radius_m)) : 500;
  const locations = await listLocations(userId);
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const location of locations) {
    const coord = parseGeoData(location.geo_data);
    if (!coord) continue;
    const distance = haversineDistanceMeters({ latitude, longitude }, coord);
    if (distance <= radius && distance < nearestDistance) {
      nearestDistance = distance;
      nearest = location;
    }
  }

  if (!nearest) return null;
  return { location: nearest, distance_m: Math.round(nearestDistance) };
}

module.exports = {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  setCurrentLocation,
  resolveNearestLocation,
  parseLocationId,
  getLocationEquipmentSummary(locationRow) {
    const raw = typeof locationRow?.equipment === 'string' ? locationRow.equipment : '';
    if (!raw) return [];
    return Array.from(new Set(
      raw
        .split(/\r?\n|,/)
        .map(s => s.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean)
    ));
  }
};
