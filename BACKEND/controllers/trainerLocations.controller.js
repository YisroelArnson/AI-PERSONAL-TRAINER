const locationService = require('../services/location.service');

function getStatusCode(error) {
  if (Number.isFinite(error?.statusCode)) return error.statusCode;
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('not found')) return 404;
  if (message.includes('required') || message.includes('invalid') || message.includes('empty')) return 422;
  return 500;
}

async function listLocations(req, res) {
  try {
    const locations = await locationService.listLocations(req.user.id);
    res.json({ success: true, locations });
  } catch (error) {
    res.status(getStatusCode(error)).json({ success: false, error: error.message || 'Failed to load locations' });
  }
}

async function createLocation(req, res) {
  try {
    const location = await locationService.createLocation(req.user.id, req.body || {});
    res.json({ success: true, location });
  } catch (error) {
    res.status(getStatusCode(error)).json({ success: false, error: error.message || 'Failed to create location' });
  }
}

async function updateLocation(req, res) {
  try {
    const location = await locationService.updateLocation(req.user.id, req.params.locationId, req.body || {});
    res.json({ success: true, location });
  } catch (error) {
    res.status(getStatusCode(error)).json({ success: false, error: error.message || 'Failed to update location' });
  }
}

async function removeLocation(req, res) {
  try {
    await locationService.deleteLocation(req.user.id, req.params.locationId);
    res.json({ success: true });
  } catch (error) {
    res.status(getStatusCode(error)).json({ success: false, error: error.message || 'Failed to delete location' });
  }
}

async function setCurrentLocation(req, res) {
  try {
    const location = await locationService.setCurrentLocation({
      userId: req.user.id,
      locationId: req.params.locationId || req.body?.location_id,
      locationName: req.body?.location_name
    });
    res.json({ success: true, location });
  } catch (error) {
    const payload = { success: false, error: error.message || 'Failed to set current location' };
    if (Array.isArray(error?.matches)) payload.matches = error.matches;
    res.status(getStatusCode(error)).json(payload);
  }
}

async function resolveNearestLocation(req, res) {
  try {
    const result = await locationService.resolveNearestLocation(req.user.id, req.body || {});
    if (!result) {
      return res.json({ success: true, location: null, distance_m: null });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(getStatusCode(error)).json({ success: false, error: error.message || 'Failed to resolve nearest location' });
  }
}

module.exports = {
  listLocations,
  createLocation,
  updateLocation,
  removeLocation,
  setCurrentLocation,
  resolveNearestLocation
};
