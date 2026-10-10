import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Check, Copy, MessageCircle, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAppAuth } from '../lib/AuthContext.jsx';
import { draftMethodConflict } from '../utils/assistantDraft.js';
import { insertPromptTemplate, resizeComposer, shouldSendOnEnter, suggestedPrompts } from '../utils/assistantComposer.js';
import { buyerSessionMessages, conversationBuyer, summaryFields } from '../../../supabase/functions/dispatch-assistant/buyer-conversation.ts';
import { availableReviewMessage, claimsReviewForm, isReviewRequest } from '../../../supabase/functions/dispatch-assistant/review-handoff.ts';

const welcomeMessage = { id: 'welcome', role: 'assistant', content: 'Paste a buyer’s details here, even if they are just a few lines. I’ll ask whether LBC delivery is Door to door or Branch pickup when needed, then prepare a form for you to review. You can also ask me to edit a buyer or look up an LBC branch or ZIP code.' };

function chatStorageKey(userId) {
  return `dcw-dispatch-chat:${userId}`;
}

function draftStorageKey(userId) {
  return `dcw-dispatch-draft:${userId}`;
}

function loadDraft(userId) {
  try { return window.sessionStorage.getItem(draftStorageKey(userId)) ?? ''; }
  catch { return ''; }
}

function loadMessages(userId) {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(chatStorageKey(userId)));
    if (Array.isArray(saved) && saved.every((message) =>
      typeof message.id === 'string' &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string'
    )) return saved.length ? saved.map((message) => message.id === 'welcome' ? welcomeMessage : message) : [welcomeMessage];
  } catch {
    // A blocked or invalid browser store should not prevent the chat from opening.
  }
  return [welcomeMessage];
}

async function assistantErrorMessage(error) {
  try {
    const body = await error?.context?.json();
    if (typeof body?.message === 'string' && body.message) return body.message;
  } catch {
    // Network failures do not have a JSON response.
  }
  return 'The assistant is unavailable right now. Please try again.';
}

function safeGoogleSearchUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://www.google.com' && url.pathname === '/search' ? url.href : null;
  } catch {
    return null;
  }
}

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['www.lbcexpress.com', 'phlpost.gov.ph', 'psgc.cloud'].includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

export default function DispatchAssistant() {
  const { id: userId } = useAppAuth();
  return <AssistantSession key={userId} userId={userId} />;
}

function AssistantSession({ userId }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => loadMessages(userId));
  const [value, setValue] = useState(() => loadDraft(userId));
  const [busy, setBusy] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [choosingDelivery, setChoosingDelivery] = useState(false);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);
  const panelRef = useRef(null);
  const requestVersion = useRef(0);
  const reviewMessage = availableReviewMessage(messages);
  const currentDraft = reviewMessage?.draft;
  const canPrepareReview = messages.at(-1)?.role === 'assistant' && (messages.at(-1)?.prepareReview || claimsReviewForm(messages.at(-1)?.content ?? ''));
  const buyerSummary = currentDraft ?? conversationBuyer(buyerSessionMessages(messages)).summary;

  useEffect(() => () => { requestVersion.current += 1; }, []);

  function clearChat() {
    requestVersion.current += 1;
    setMessages([welcomeMessage]);
    setValue('');
    setBusy(false);
    setCopiedMessageId(null);
    setChoosingDelivery(false);
    try {
      window.sessionStorage.removeItem(chatStorageKey(userId));
      window.sessionStorage.removeItem(draftStorageKey(userId));
    } catch { /* The in-memory conversation is still cleared. */ }
    inputRef.current?.focus();
  }

  function reviewDraft(message) {
    setOpen(false);
    if (message.editDraft && message.existingBuyerId) {
      navigate(`/buyers/${message.existingBuyerId}/edit`, { state: { editDraft: message.editDraft, draftNotice: message.content, draftSourceUrl: message.sourceUrl } });
    } else if (message.draft) {
      navigate('/buyers/new', { state: { buyerDraft: message.draft, draftNotice: message.content, draftSourceUrl: message.sourceUrl, draftGoogleSearchUrl: message.googleSearchUrl } });
    }
  }

  useEffect(() => {
    const saved = (event) => {
      const { buyer, edited, deliveryMethod } = event.detail;
      const destination = deliveryMethod === 'pickup' ? buyer.pickups.find((item) => item.isDefault) ?? buyer.pickups[0] : buyer.addresses.find((item) => item.isDefault) ?? buyer.addresses[0];
      const details = deliveryMethod === 'pickup' ? [destination?.branchName, destination?.branchAddress] : [destination?.street, destination?.barangay, destination?.city, destination?.province, destination?.zipCode];
      requestVersion.current += 1;
      setBusy(false);
      setValue('');
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', completedBuyer: true, existingBuyerId: buyer.id, content: `${edited ? 'Updated' : 'Saved'} ${buyer.name} (${buyer.phone}).\n${buyer.preferredCourier} ${deliveryMethod === 'pickup' ? 'branch pickup' : 'door to door'}\n${details.filter(Boolean).join(', ')}` }]);
    };
    window.addEventListener('dispatch-buyer-saved', saved);
    return () => window.removeEventListener('dispatch-buyer-saved', saved);
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(chatStorageKey(userId), JSON.stringify(messages));
    } catch {
      // Chat still works in memory if session storage is unavailable or full.
    }
  }, [messages, userId]);

  useEffect(() => {
    try { window.sessionStorage.setItem(draftStorageKey(userId), value); }
    catch { /* Keep the unfinished message in memory if storage is unavailable. */ }
  }, [value, userId]);

  useLayoutEffect(() => {
    if (!open) return;
    const history = messagesRef.current;
    const nearBottom = history && history.scrollHeight - history.scrollTop - history.clientHeight < 48;
    resizeComposer(inputRef.current);
    if (nearBottom) history.scrollTop = history.scrollHeight;
  }, [value, open]);

  useEffect(() => {
    if (!open) return undefined;
    const viewport = window.visualViewport;
    const updateKeyboardOffset = () => {
      const coveredHeight = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      panelRef.current?.style.setProperty('--assistant-keyboard-offset', `${Math.round(coveredHeight)}px`);
    };
    updateKeyboardOffset();
    viewport?.addEventListener('resize', updateKeyboardOffset);
    viewport?.addEventListener('scroll', updateKeyboardOffset);
    window.addEventListener('resize', updateKeyboardOffset);
    return () => {
      viewport?.removeEventListener('resize', updateKeyboardOffset);
      viewport?.removeEventListener('scroll', updateKeyboardOffset);
      window.removeEventListener('resize', updateKeyboardOffset);
    };
  }, [open]);

  useEffect(() => {
    if (open) messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  async function submitMessage(content) {
    content = content.trim();
    if (!content || busy) return;
    if (isReviewRequest(content) && reviewMessage) {
      setValue('');
      reviewDraft(reviewMessage);
      return;
    }
    const version = ++requestVersion.current;
    const next = [...messages, { id: crypto.randomUUID(), role: 'user', content }];
    setMessages(next);
    setValue('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('dispatch-assistant', {
        body: { messages: buyerSessionMessages(next).slice(-40).map(({ role, content: text, branchChoices }) => ({ role, content: text, ...(branchChoices ? { branchChoices } : {}) })) },
      });
      if (version !== requestVersion.current) return;
      if (error) throw error;
      if (data?.draft) {
        if (draftMethodConflict(next.slice(-12), data.draft)) {
          setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: 'I stopped that draft because its delivery method does not match what you chose. Please use the buyer form directly or try again later.' }]);
          return;
        }
      }
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: data?.message || 'I could not complete that request.', prepareReview: data?.prepareReview, existingBuyerId: data?.existingBuyerId, googleSearchUrl: safeGoogleSearchUrl(data?.googleSearchUrl), sourceUrl: safeSourceUrl(data?.sourceUrl), branchChoices: data?.branchChoices, draft: data?.draft, editDraft: data?.editDraft }]);
    } catch (error) {
      const message = await assistantErrorMessage(error);
      if (version !== requestVersion.current) return;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: message }]);
    } finally {
      if (version === requestVersion.current) {
        setBusy(false);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  }

  function send(event) {
    event.preventDefault();
    return submitMessage(value);
  }

  function selectPrompt(template) {
    setValue((current) => insertPromptTemplate(current, template));
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  }

  async function copyMessage(message) {
    try {
      const copyField = document.createElement('textarea');
      copyField.value = message.content;
      copyField.style.position = 'fixed';
      copyField.style.opacity = '0';
      document.body.appendChild(copyField);
      let copied = false;
      try {
        copyField.select();
        copied = document.execCommand('copy');
      } finally {
        copyField.remove();
      }
      if (!copied) await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? null : current), 2000);
    } catch {
      setCopiedMessageId(null);
    }
  }

  return <>
    <button className={`assistant-launcher${open ? ' is-open' : ''}`} type="button" onClick={() => setOpen((current) => !current)} aria-label={open ? 'Close dispatch assistant' : 'Open dispatch assistant'} aria-expanded={open} aria-controls="dispatch-assistant-panel">
      {open ? <X size={24} /> : <MessageCircle size={24} />}
    </button>
    {open && <section ref={panelRef} id="dispatch-assistant-panel" className="assistant-panel" aria-label="AI dispatch assistant">
      <header className="assistant-header">
        <span className="assistant-title"><Bot size={20} /> Dispatch Assistant</span>
        <button type="button" onClick={clearChat} className="assistant-clear">Clear chat</button>
        <button type="button" className="assistant-close" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={19} /></button>
      </header>
      <div ref={messagesRef} className="assistant-messages" aria-live="polite">
        {messages.map((message) => <div key={message.id} className={`assistant-message ${message.role}`}>
          <span className="assistant-message-text">{message.role === 'user' ? message.content : message.content.replaceAll('**', '')}</span>
          {message.role === 'user' && <button type="button" className="assistant-copy-button" onClick={() => copyMessage(message)} aria-label={copiedMessageId === message.id ? 'Copied message' : 'Copy message'}>{copiedMessageId === message.id ? <Check size={14} /> : <Copy size={14} />}{copiedMessageId === message.id ? 'Copied' : 'Copy'}</button>}
          {message.existingBuyerId && <button type="button" className="assistant-result-link" onClick={() => { setOpen(false); navigate(`/buyers/${message.existingBuyerId}`); }}>Open buyer</button>}
          {safeSourceUrl(message.sourceUrl) && <a className="assistant-result-link" href={message.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a>}
          {safeGoogleSearchUrl(message.googleSearchUrl) && <a className="assistant-result-link" href={message.googleSearchUrl} target="_blank" rel="noopener noreferrer">Check on Google</a>}
          {(message.draft || message.editDraft) && message === messages.at(-1) && <button type="button" disabled={busy} className="assistant-result-link" onClick={() => reviewDraft(message)}>Review and edit form</button>}
          {Array.isArray(message.branchChoices) && <div className="assistant-choices">{message.branchChoices.map((branch, index) => <div className="assistant-choice" key={`${branch.branch_name}-${branch.branch_address}`}><button type="button" disabled={busy || message !== messages.at(-1)} onClick={() => submitMessage(`Use option ${index + 1}`)}><strong>{index + 1}. {branch.branch_name}</strong><span>{branch.branch_address}</span></button>{safeSourceUrl(branch.source_url) && <a href={safeSourceUrl(branch.source_url)} target="_blank" rel="noopener noreferrer">View LBC source</a>}</div>)}</div>}
        </div>)}
        {busy && <div className="assistant-message assistant" role="status">Thinking…</div>}
        {buyerSummary && <section className="assistant-buyer-summary" aria-label="Current buyer summary">
          <h3>Current buyer <small>Not saved</small></h3>
          <p>Tap a detail to correct it, or review the form when ready.</p>
          <dl>{summaryFields(buyerSummary).map(([label, detail, field]) => <div key={field}>
            <dt>{label}</dt><dd><button type="button" disabled={busy} aria-label={`Change ${label.toLowerCase()}: ${detail || 'missing'}`} className={!detail ? 'is-missing' : ''} onClick={() => { if (field === 'courier' || field === 'delivery') setChoosingDelivery(true); else { setValue(`Change ${field} to `); inputRef.current?.focus(); } }}>{detail || 'Missing — add detail'}</button></dd>
          </div>)}</dl>
          {(!buyerSummary.deliveryMethod || choosingDelivery) && <div className="assistant-delivery-options">{['LBC door to door', 'LBC branch pickup', 'J&T Express door to door'].map((choice) => <button key={choice} type="button" disabled={busy} onClick={() => { setChoosingDelivery(false); submitMessage(choice); }}>{choice}</button>)}</div>}
        </section>}
      </div>
      <form className="assistant-composer" onSubmit={send}>
        {(reviewMessage || canPrepareReview) && <div className="assistant-review-action">
          <button className="button button-primary" type="button" disabled={busy} onClick={() => reviewMessage ? reviewDraft(reviewMessage) : submitMessage('Review buyer form')}>{reviewMessage ? 'Open review form' : 'Prepare review form'}</button>
          <small>{reviewMessage?.editDraft ? 'Review the form, then click Save changes.' : 'Review the form, then click Create buyer to save.'}</small>
        </div>}
        <div className="assistant-prompt-list" role="group" aria-label="Suggested messages">
          {suggestedPrompts.map(({ label, template }) => <button key={label} className="assistant-prompt" type="button" onClick={() => selectPrompt(template)}>{label}</button>)}
        </div>
        <textarea ref={inputRef} rows={2} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => {
          const touchOnly = window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches;
          if (shouldSendOnEnter({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode }, touchOnly)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }} placeholder="Type buyer details or ask a question…" aria-label="Message" />
        <button type="submit" disabled={busy || !value.trim()} aria-label="Send message"><Send size={19} /></button>
        <span className="assistant-composer-hint assistant-desktop-hint">Enter to send · Shift+Enter for a new line</span>
        <span className="assistant-composer-hint assistant-mobile-hint">Tap Send · Enter for a new line</span>
      </form>
    </section>}
  </>;
}
