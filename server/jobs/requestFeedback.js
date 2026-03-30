const cron = require('node-cron');
const PurchasedLead = require('../models/PurchasedLead');
const { sendFeedbackRequestEmail, sendReviewRequestEmail } = require('../services/emailService');

// Run every day at 10:00 AM server time
cron.schedule('0 10 * * *', async () => {
    console.log('[Cron] Running daily feedback request job...');

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    let purchases;
    try {
        purchases = await PurchasedLead.find({ feedbackEmailSent: false })
            .populate('lead')
            .populate('company');
    } catch (err) {
        console.error('[Cron] Failed to fetch purchases:', err.message);
        return;
    }

    let sentCount = 0;

    for (const purchase of purchases) {
        if (!purchase.lead || !purchase.company) continue;

        const moveDate = new Date(purchase.lead.moveDate);
        if (moveDate >= twoDaysAgo || moveDate <= tenDaysAgo) continue;

        try {
            // Always send the feedback/complaint invitation
            await sendFeedbackRequestEmail({
                toEmail:      purchase.lead.customerEmail,
                customerName: purchase.lead.customerName,
                companyName:  purchase.company.companyName,
                leadId:       purchase.lead._id,
                companyId:    purchase.company._id,
            });

            // Also send Google review request if the mover has set their review link
            if (purchase.company.googleReviewLink) {
                await sendReviewRequestEmail({
                    toEmail:      purchase.lead.customerEmail,
                    customerName: purchase.lead.customerName,
                    companyName:  purchase.company.companyName,
                    reviewLink:   purchase.company.googleReviewLink,
                });
            }

            purchase.feedbackEmailSent = true;
            await purchase.save();
            sentCount++;
        } catch (err) {
            // Log and continue — don't let one failed send abort the rest
            console.error(`[Cron] Failed to send email for purchase ${purchase._id}:`, err.message);
        }
    }

    console.log(`[Cron] Sent ${sentCount} automated feedback request emails.`);
});
