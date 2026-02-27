const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerLocations.controller');

router.use(authenticateToken);

router.get('/', controller.listLocations);
router.post('/', controller.createLocation);
router.patch('/:locationId', controller.updateLocation);
router.delete('/:locationId', controller.removeLocation);
router.post('/:locationId/set-current', controller.setCurrentLocation);
router.post('/resolve-nearest', controller.resolveNearestLocation);

module.exports = router;
