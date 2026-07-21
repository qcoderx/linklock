import { Router } from 'express';
import { verifyWebhookSignature } from '../lib/monnify.js';
import * as svc from '../services/orderService.js';

const router = Router();

/**
 * Monnify webhook endpoint. Verifies the monnify-signature header (HMAC-SHA512 of the
 * RAW body) before acting. Inbound payments drive CREATED → LOCKED, idempotently.
 */
router.post('/monnify', async (req, res) => {
  const signature = req.get('monnify-signature');
  const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});

  if (!verifyWebhookSignature(raw, signature)) {
    console.warn('[webhook] rejected: invalid monnify-signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { eventType, eventData } = req.body || {};
  // Always 200 quickly so Monnify does not retry endlessly; process known events.
  try {
    if (eventType === 'SUCCESSFUL_TRANSACTION' || eventData?.paymentStatus === 'PAID') {
      const accountRef =
        eventData?.product?.reference ||
        eventData?.accountReference ||
        eventData?.destinationAccountInformation?.accountReference;

      const order = accountRef ? svc.getOrderByVaRef(accountRef) : null;
      if (!order) {
        console.warn(`[webhook] no order for accountReference=${accountRef}`);
      } else {
        await svc.handleInboundPayment({
          order,
          amountPaid: Number(eventData.amountPaid ?? eventData.settlementAmount ?? order.amount),
          paymentReference: eventData.paymentReference,
          transactionReference: eventData.transactionReference,
          source: {
            accountNumber: eventData?.paymentSourceInformation?.[0]?.accountNumber,
            bankCode: eventData?.paymentSourceInformation?.[0]?.bankCode,
            accountName: eventData?.paymentSourceInformation?.[0]?.accountName || eventData?.customer?.name,
          },
        });
        console.log(`[webhook] LOCKED ${order.ref} (₦${eventData.amountPaid})`);
      }
    } else {
      console.log(`[webhook] ack eventType=${eventType}`);
    }
  } catch (err) {
    console.error('[webhook] processing error:', err.message);
  }
  res.status(200).json({ received: true });
});

export default router;
