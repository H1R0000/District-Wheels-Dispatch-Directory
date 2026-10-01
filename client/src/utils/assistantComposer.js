export const suggestedPrompts = [
  { label: 'Add a buyer', template: 'Add a buyer\nCourier and delivery type: \nName: \nPhone: \nComplete address or LBC branch: ' },
  { label: 'Edit a buyer', template: 'Edit a buyer\nBuyer name or phone: \nChange: ' },
  { label: 'Remove a buyer', template: 'Remove a buyer\nBuyer name or phone: ' },
  { label: 'Find a buyer', template: 'Find a buyer\nName or phone: ' },
  { label: 'Find an LBC branch', template: 'Find an LBC branch\nBranch name or location: ' },
];

export function insertPromptTemplate(draft, template) {
  if (!draft.trim()) return template;
  return `${draft}${draft.endsWith('\n') ? '\n' : '\n\n'}${template}`;
}

export function shouldSendOnEnter(event, touchOnly = false) {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !touchOnly;
}

export function resizeComposer(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}
