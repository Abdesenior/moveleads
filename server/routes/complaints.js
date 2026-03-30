const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Complaint = require('../models/Complaint');
const PurchasedLead = require('../models/PurchasedLead');

// @route   POST /api/complaints
// @desc    Customer: Create a new complaint
// @access  Public (Accessed via secure email link in production)
router.post('/', async (req, res) => {
    const { leadId, companyId, customerName, customerEmail, issueType, description } = req.body;

    try {
        // Security Check: Verify the mover actually purchased this lead
        const purchase = await PurchasedLead.findOne({ lead: leadId, company: companyId });
        if (!purchase) {
            return res.status(400).json({ msg: 'Invalid request: Company did not purchase this lead.' });
        }

        const complaint = new Complaint({
            lead: leadId,
            company: companyId,
            customerName,
            customerEmail,
            issueType,
            description
        });

        await complaint.save();
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
        // Admin gets all complaints, Mover gets only theirs
        const query = req.user.role === 'admin' ? {} : { company: req.user.id };

        const complaints = await Complaint.find(query)
            .populate('lead', 'route moveDate homeSize')
            .sort({ updatedAt: -1 });

        res.json(complaints);
    } catch (err) {
        console.error('[Get Complaints Error]', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/complaints/:id/messages
// @desc    Add a message to the internal complaint thread
// @access  Public (Customer) / Private (Mover)
router.post('/:id/messages', async (req, res) => {
    const { text, sender } = req.body; // sender should be 'customer', 'mover', or 'admin'

    try {
        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) return res.status(404).json({ msg: 'Complaint not found' });

        complaint.messages.push({
            sender,
            text
        });

        complaint.updatedAt = Date.now();
        await complaint.save();

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
        const complaint = await Complaint.findByIdAndUpdate(
            req.params.id,
            { $set: { status, updatedAt: Date.now() } },
            { returnDocument: 'after' }
        ).populate('lead', 'route moveDate homeSize');

        res.json(complaint);
    } catch (err) {
        console.error('[Update Complaint Status Error]', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;