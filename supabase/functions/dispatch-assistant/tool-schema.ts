export const tools = [
  { type: 'function', function: { name: 'search_buyers', description: 'Find buyers by name or phone before editing or deleting.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'add_buyer', description: 'Prepare a buyer draft for human review. The server determines LBC delivery method from the user choice. LBC door delivery requires a complete address; LBC branch pickup requires branch name and address. J&T requires a complete address.', parameters: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, preferred_courier: { type: 'string', enum: ['LBC', 'J&T Express'] }, address: { type: 'object', properties: { street: { type: 'string' }, barangay: { type: 'string' }, city: { type: 'string' }, province: { type: 'string' }, zip_code: { type: 'string' } } }, pickup: { type: 'object', properties: { branch_name: { type: 'string' }, branch_address: { type: 'string' } } } }, required: ['name', 'phone', 'preferred_courier'] } } },
  { type: 'function', function: { name: 'edit_buyer', description: 'After search_buyers finds one exact buyer, prepare only the changes the user requested for the edit form. Never invent a field or copy unchanged fields into this patch. This does not save.', parameters: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, phone: { type: 'string' }, preferred_courier: { type: 'string', enum: ['LBC', 'J&T Express'] }, address: { type: 'object', properties: { street: { type: 'string' }, barangay: { type: 'string' }, city: { type: 'string' }, province: { type: 'string' }, zip_code: { type: 'string' } } }, pickup: { type: 'object', properties: { branch_name: { type: 'string' }, branch_address: { type: 'string' } } } }, required: ['id'] } } },
  { type: 'function', function: { name: 'delete_buyer', description: 'Prepare deletion of exactly one buyer. This only creates a confirmation code; it never deletes immediately.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'lookup_zip', description: 'Look up a Philippine ZIP code by city or municipality.', parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] } } },
  { type: 'function', function: { name: 'search_lbc_branch', description: 'Find verified LBC branch names and addresses.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
];
export const phone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('63') && digits.length === 12 ? `0${digits.slice(2)}` : digits;
};
export const filled = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
export const addressFields = ['street', 'barangay', 'city', 'province', 'zip_code'];

