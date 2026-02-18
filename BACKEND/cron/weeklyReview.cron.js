const cron = require('node-cron');
const { runWeeklyReview, getActiveUsers } = require('../services/weeklyReview.service');

// Run Sunday at 11 PM UTC
const WEEKLY_REVIEW_SCHEDULE = '0 23 * * 0';

function registerWeeklyReviewCron() {
  cron.schedule(WEEKLY_REVIEW_SCHEDULE, async () => {
    console.log('[cron] Weekly review started at', new Date().toISOString());
    const t0 = Date.now();

    let activeUsers;
    try {
      activeUsers = await getActiveUsers();
    } catch (err) {
      console.error('[cron] Failed to fetch active users:', err.message);
      return;
    }

    console.log(`[cron] Found ${activeUsers.length} active users`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const userId of activeUsers) {
      try {
        const result = await runWeeklyReview(userId);
        if (result.skipped) {
          skipCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        errorCount++;
        console.error(`[cron] Weekly review failed for user ${userId}:`, err.message);
        // Don't block other users
      }
    }

    console.log(`[cron] Weekly review complete in ${Date.now() - t0}ms — success=${successCount}, skipped=${skipCount}, errors=${errorCount}`);
  });

  console.log(`[cron] Weekly review scheduled: ${WEEKLY_REVIEW_SCHEDULE} (Sunday 11 PM UTC)`);
}

module.exports = { registerWeeklyReviewCron };
