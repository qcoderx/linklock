import { db, now } from '../db.js';
import { uid } from './ids.js';

/**
 * Records the chat message LinkLock "sends" to a party. In production this is delivered
 * over SMS / WhatsApp; here it is stored and surfaced in the UI so the demo shows the
 * exact messages a real user would receive (safe-to-ship, said-No ping, confirm link).
 */
export function sendMessage(orderId, audience, kind, body) {
  const row = { id: uid('msg'), order_id: orderId, audience, kind, body, created_at: now() };
  db.prepare(
    `INSERT INTO messages (id, order_id, audience, kind, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.order_id, row.audience, row.kind, row.body, row.created_at);
  return row;
}

export function listMessages(orderId) {
  return db
    .prepare('SELECT * FROM messages WHERE order_id = ? ORDER BY created_at ASC')
    .all(orderId);
}
