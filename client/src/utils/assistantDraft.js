import { latestDeliveryMethod } from '../../../supabase/functions/dispatch-assistant/delivery-method.ts';

export function draftMethodConflict(messages, draft) {
  const requested = latestDeliveryMethod(messages);
  const prepared = draft?.deliveryMethod ?? (draft?.branchName != null ? 'pickup' : draft?.address ? 'door' : null);
  return requested === 'ambiguous' || Boolean(requested && prepared !== requested);
}
