const { createModel } = require("../lib/fileDb");

/**
 * Payment ledger for store Easebuzz transactions (audit + refunds).
 * Orders remain the source of truth for paid/failed; this collection
 * stores txn history, raw callbacks, and refund rows.
 */
module.exports = createModel("store_payments");
