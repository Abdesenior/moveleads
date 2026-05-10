const AdminAction = require('../models/AdminAction');

// Fire-and-forget audit writer. Never throws — audit failure must not block
// the caller's primary action. Callers may `await` it for ordering but the
// internal try/catch swallows every error.
async function logAdminAction({ actor, action, targetType, targetId, before, after, metadata }) {
  try {
    await AdminAction.create({ actor, action, targetType, targetId, before, after, metadata });
  } catch (err) {
    console.error('[AuditLog] failed to write:', err.message);
    // never throw — audit failure should not block the action
  }
}

module.exports = { logAdminAction };
