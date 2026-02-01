const monitoringService = require('../services/trainerMonitoring.service');

async function generateWeeklyReport(req, res) {
  try {
    const userId = req.user.id;
    const { week_start } = req.body || {};
    const report = await monitoringService.generateWeeklyReport(userId, week_start);
    res.json({ success: true, report: report.report_json });
  } catch (error) {
    console.error('Generate weekly report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function listReports(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit || '8', 10);
    const reports = await monitoringService.listReports(userId, limit);
    res.json({ success: true, reports: reports.map(r => r.report_json) });
  } catch (error) {
    console.error('List reports error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  generateWeeklyReport,
  listReports
};
