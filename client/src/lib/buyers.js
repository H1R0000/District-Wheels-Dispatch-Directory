import { apiRequest } from './apiRequest.js';

export const listBuyers = (query = '', options) => apiRequest(`/buyers?q=${encodeURIComponent(query)}`, options);
export async function getBuyer(id, options) {
  try { return await apiRequest(`/buyers/${encodeURIComponent(id)}`, options); }
  catch (error) { if (error.status === 404) return null; throw error; }
}
export const saveBuyer = (buyer, id) => apiRequest(id ? `/buyers/${encodeURIComponent(id)}` : '/buyers', { method: id ? 'PUT' : 'POST', body: buyer });
export const deleteBuyer = (id) => apiRequest(`/buyers/${encodeURIComponent(id)}`, { method: 'DELETE' });
