// Tiny fetch wrapper around the LinkLock API (proxied to :4000 in dev).
const BASE = '/api';

async function req(path, { method = 'GET', body, form, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form; // FormData — let the browser set the boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  status: () => req('/status'),
  banks: () => req('/banks'),

  createOrder: (body) => req('/orders', { method: 'POST', body }),
  getOrder: (ref) => req(`/orders/${ref}`),
  simulatePayment: (ref) => req(`/orders/${ref}/simulate-payment`, { method: 'POST' }),
  ship: (ref, form) => req(`/orders/${ref}/ship`, { method: 'POST', form }),
  deliver: (ref) => req(`/orders/${ref}/deliver`, { method: 'POST' }),
  confirm: (ref) => req(`/orders/${ref}/confirm`, { method: 'POST' }),
  dispute: (ref, form) => req(`/orders/${ref}/dispute`, { method: 'POST', form }),
  vendorResponse: (ref, response) => req(`/orders/${ref}/vendor-response`, { method: 'POST', body: { response } }),

  admin: {
    orders: (token) => req('/admin/orders', { token }),
    reviewQueue: (token) => req('/admin/review-queue', { token }),
    recompare: (token, ref) => req(`/admin/orders/${ref}/recompare`, { method: 'POST', token }),
    resolve: (token, ref, decision, note) =>
      req(`/admin/orders/${ref}/resolve`, { method: 'POST', token, body: { decision, note } }),
  },
};
