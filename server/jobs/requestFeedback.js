const cron = require('node-cron');
const PurchasedLead = require('../models/PurchasedLead');
const { sendFeedbackRequestEmail } = require('../services/emailService');

// Run every day at 10:00 AM server time
cron.schedule('0 10 * * *', async () => {
    console.log('[Cron] Running daily feedback request job...');
    try {
        // Find moves that happened at least 2 days ago (but less than 10 days ago to avoid ancient ones)
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

        const purchases = await PurchasedLead.find({
            feedbackEmailSent: false
        }).populate('lead').populate('company');

        let sentCount = 0;

        for (const purchase of purchases) {
            if (!purchase.lead || !purchase.company) continue;

            const moveDate = new Date(purchase.lead.moveDate);

            // If the move was between 2 and 10 days ago
            if (moveDate < twoDaysAgo && moveDate > tenDaysAgo) {
                await sendFeedbackRequestEmail({
                    toEmail: purchase.lead.customerEmail,
                    customerName: purchase.lead.customerName,
                    companyName: purchase.company.companyName,
                    leadId: purchase.lead._id,
                    companyId: purchase.company._id
                });

                purchase.feedbackEmailSent = true;
                await purchase.save();
                sentCount++;
            }
        }
        console.log(`[Cron] Sent ${sentCount} automated feedback request emails.`);
    } catch (err) {
        console.error('[Cron] Feedback request job failed:', err.message);
    }
});