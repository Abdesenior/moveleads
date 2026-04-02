const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const Complaint = require('../models/Complaint');
const PurchasedLead = require('../models/PurchasedLead');
const Lead = require('../models/Lead');
const { sendMoverReplyEmail } = require('../services/emailService');

// @route   POST /api/complaints
// @desc    Customer: Create a new complaint
//          Two paths:
//            1. Linked   — leadId + companyId present (magic link). Verify purchase then save.
//            2. Unlinked — no IDs. Try to auto-link via customer email. If no match, save to
//                          admin queue (isLinked: false) for manual assignment.
// @access  Public
router.post('/', async (req, res) => {
    const { leadId, companyId, customerName, customerEmail, issueType, description, companyNameManual } = req.body;

    if (!customerName || !customerEmail || !issueType || !description) {
        return res.status(400).json({ msg: 'Name, email, issue type, and description are required.' });
    }

    try {
        const complaintData = { customerName, customerEmail, issueType, description };

        const hasIds = leadId && companyId
            && mongoose.isValidObjectId(leadId)
            && mongoose.isValidObjectId(companyId);

        console.log(`[Complaints POST] hasIds=${hasIds} leadId=${leadId} companyId=${companyId} email=${customerEmail}`);

        if (hasIds) {
            // ── Path 1: magic-link submission ──────────────────────────────────
            const purchase = await PurchasedLead.findOne({ lead: leadId, company: companyId });
            console.log(`[Complaints POST] PurchasedLead lookup: ${purchase ? `found (${purchase._id})` : 'NOT FOUND'}`);
            if (!purchase) {
                return res.status(400).json({ msg: 'Invalid link: this company did not purchase that lead.' });
            }
            complaintData.lead      = leadId;
            complaintData.company   = companyId;
            complaintData.isLinked  = true;
        } else {
            // ── Path 2: manual submission — try auto-link by email ─────────────
            const matchingLead = await Lead.findOne({
                customerEmail: customerEmail.toLowerCase().trim()
            }).sort({ createdAt: -1 });

            if (matchingLead) {
                const purchase = await PurchasedLead.findOne({ lead: matchingLead._id }).sort({ purchasedAt: -1 });
                if (purchase) {
                    // Auto-linked successfully
                    complaintData.lead     = matchingLead._id;
                    complaintData.company  = purchase.company;
                    complaintData.isLinked = true;
                    console.log(`[Complaints] Auto-linked complaint for ${customerEmail} → lead ${matchingLead._id}`);
                }
            }

            if (!complaintData.isLinked) {
                // Falls through to admin queue
                complaintData.companyNameManual = companyNameManual || '';
                complaintData.isLinked  = false;
                console.log(`[Complaints] Unlinked complaint from ${customerEmail} — routed to admin queue`);
            }
        }

        const complaint = new Complaint(complaintData);
        await complaint.save();
        console.log(`[Complaints POST] Saved complaint ${complaint._id} isLinked=${complaint.isLinked} company=${complaint.company}`);
        res.status(201).json(complaint);
    } catch (err) {
        console.error('[Create Complaint Error]', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/complaints
// @desc    Mover: Get all complaints against their company
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        // Admin gets all complaints (including unlinked); Mover gets only theirs
        const query = req.user.role === 'admin'
            ? {}
            : { company: req.user.id, isLinked: true };

        const complaints = await Complaint.find(query)
            .populate('lead', 'route moveDate homeSize originCity destinationCity')
            .sort({ updatedAt: -1 });

        res.json(complaints);
    } catch (err) {
        console.error('[Get Complaints Error]', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/complaints/:id/messages
// @desc    Add a message to the internal complaint thread
//          Sender is derived from auth context — never trusted from client:
//            authenticated admin  → 'admin'
//            authenticated mover  → 'mover'
//            no token             → 'customer'
// @access  Public (Customer) / Private (Mover/Admin)
router.post('/:id/messages', async (req, res) => {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ msg: 'Message text is required.' });

    // Determine sender from JWT, not from request body
    let sender = 'customer';
    const authHeader = req.headers['x-auth-token'];
    if (authHeader) {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(authHeader, process.env.JWT_SECRET);
            sender = decoded.user?.role === 'admin' ? 'admin' : 'mover';
        } catch {
            // Invalid token — treat as customer
        }
    }

    try {
        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) return res.status(404).json({ msg: 'Complaint not found' });

        const newMessage = { sender, text: text.trim() };
        complaint.messages.push(newMessage);
        complaint.updatedAt = Date.now();
        await complaint.save();

        // Notify customer by email when mover or admin replies
        if (sender === 'mover' || sender === 'admin') {
            const clientUrl = process.env.CLIENT_URL || 'https://moveleads.cloud';
            const conversationUrl = complaint.lead && complaint.company
                ? `${clientUrl}/feedback?leadId=${complaint.lead}&companyId=${complaint.company}`
                : `${clientUrl}/feedback`;
            sendMoverReplyEmail({
                toEmail: complaint.customerEmail,
                customerName: complaint.customerName,
                replyText: text.trim(),
                conversationUrl,
            }).catch(err => console.error('[Reply Email Error]', err.message));
        }

        res.json(complaint);
    } catch (err) {
        console.error('[Add Complaint Message Error]', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PATCH /api/complaints/:id/status
// @desc    Mover/Admin: Update complaint status (e.g., mark as 'Resolved')
// @access  Private
router.patch('/:id/status', auth, async (req, res) => {
    const { status } = req.body;

    try {
        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) return res.status(404).json({ msg: 'Complaint not found.' });

        if (req.user.role !== 'admin' && complaint.company?.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Not authorized to update this complaint.' });
        }

        complaint.status    = status;
        complaint.updatedAt = Date.now();
        await complaint.save();

        await complaint.populate('lead', 'route moveDate homeSize');
        res.json(complaint);
    } catch (err) {
        console.error('[Update Complaint Status Error]', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;