import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Check, Copy, MessageCircle, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAppAuth } from '../lib/AuthContext.jsx';
import { draftMethodConflict } from '../utils/assistantDraft.js';

const welcomeMessage = { id: 'welcome', role: 'assistant', content: 'Paste a buyer’s details here, even if they are just a few lines. I’ll ask whether LBC delivery is Door to door or Branch pickup when needed, then prepare a form for you to review. You can also ask me to edit a buyer or look up an LBC branch or ZIP code.' };

function chatStorageKey(userId) {
  return `dcw-dispatch-chat:${userId}`;
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
    return url.protocol === 'https:' && ['www.lbcexpress.com', 'phlpost.gov.ph'].includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

export default function DispatchAssistant() {
  const { id: userId } = useAppAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => loadMessages(userId));
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(chatStorageKey(userId), JSON.stringify(messages));
    } catch {
      // Chat still works in memory if session storage is unavailable or full.
    }
  }, [messages, userId]);

  useEffect(() => {
    if (open) messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  async function submitMessage(content) {
    content = content.trim();
    if (!content || busy) return;
    const next = [...messages, { id: crypto.randomUUID(), role: 'user', content }];
    setMessages(next);
    setValue('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('dispatch-assistant', {
        body: { messages: next.slice(-12).map(({ role, content: text }) => ({ role, content: text })) },
      });
      if (error) throw error;
      if (data?.draft) {
        if (draftMethodConflict(next.slice(-12), data.draft)) {
          setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: 'I stopped that draft because its delivery method does not match what you chose. Please use the buyer form directly or try again later.' }]);
          return;
        }
      }
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: data?.message || 'I could not complete that request.', existingBuyerId: data?.existingBuyerId, googleSearchUrl: safeGoogleSearchUrl(data?.googleSearchUrl), sourceUrl: safeSourceUrl(data?.sourceUrl), branchChoices: data?.branchChoices }]);
      if (data?.editDraft && data?.existingBuyerId) {
        setOpen(false);
        navigate(`/buyers/${data.existingBuyerId}/edit`, { state: { editDraft: data.editDraft, draftNotice: data.message, draftSourceUrl: safeSourceUrl(data.sourceUrl) } });
        return;
      }
      if (data?.draft) {
        setOpen(false);
        navigate('/buyers/new', { state: { buyerDraft: data.draft, draftNotice: data.message, draftSourceUrl: safeSourceUrl(data.sourceUrl), draftGoogleSearchUrl: safeGoogleSearchUrl(data.googleSearchUrl) } });
      }
    } catch (error) {
      const message = await assistantErrorMessage(error);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: message }]);
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function send(event) {
    event.preventDefault();
    return submitMessage(value);
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
    <button className="assistant-launcher" type="button" onClick={() => setOpen((current) => !current)} aria-label={open ? 'Close dispatch assistant' : 'Open dispatch assistant'} aria-expanded={open} aria-controls="dispatch-assistant-panel">
      {open ? <X size={24} /> : <MessageCircle size={24} />}
    </button>
    {open && <section id="dispatch-assistant-panel" className="assistant-panel" aria-label="AI dispatch assistant">
      <header className="assistant-header">
        <span className="assistant-title"><Bot size={20} /> Dispatch Assistant</span>
        <button type="button" className="assistant-close" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={19} /></button>
      </header>
      <div ref={messagesRef} className="assistant-messages" aria-live="polite">
        {messages.map((message) => <div key={message.id} className={`assistant-message ${message.role}`}>
          <span className="assistant-message-text">{message.role === 'user' ? message.content : message.content.replaceAll('**', '')}</span>
          {message.role === 'user' && <button type="button" className="assistant-copy-button" onClick={() => copyMessage(message)} aria-label={copiedMessageId === message.id ? 'Copied message' : 'Copy message'}>{copiedMessageId === message.id ? <Check size={14} /> : <Copy size={14} />}{copiedMessageId === message.id ? 'Copied' : 'Copy'}</button>}
          {message.existingBuyerId && <button type="button" className="assistant-result-link" onClick={() => { setOpen(false); navigate(`/buyers/${message.existingBuyerId}`); }}>Open buyer</button>}
          {safeSourceUrl(message.sourceUrl) && <a className="assistant-result-link" href={message.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a>}
          {safeGoogleSearchUrl(message.googleSearchUrl) && <a className="assistant-result-link" href={message.googleSearchUrl} target="_blank" rel="noopener noreferrer">Check on Google</a>}
          {Array.isArray(message.branchChoices) && <div className="assistant-choices">{message.branchChoices.map((branch, index) => <div className="assistant-choice" key={`${branch.branch_name}-${branch.branch_address}`}><button type="button" disabled={busy} onClick={() => submitMessage(`Use LBC branch pickup: ${branch.branch_name}, ${branch.branch_address}`)}><strong>{index + 1}. {branch.branch_name}</strong><span>{branch.branch_address}</span></button>{safeSourceUrl(branch.source_url) && <a href={safeSourceUrl(branch.source_url)} target="_blank" rel="noopener noreferrer">View LBC source</a>}</div>)}</div>}
        </div>)}
        {busy && <div className="assistant-message assistant" role="status">Thinking…</div>}
      </div>
      <form className="assistant-composer" onSubmit={send}>
        <textarea ref={inputRef} rows={2} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }} placeholder="Type buyer details or ask a question…" aria-label="Message" />
        <button type="submit" disabled={busy || !value.trim()} aria-label="Send message"><Send size={19} /></button>
        <span className="assistant-composer-hint">Enter to send · Shift+Enter for a new line</span>
      </form>
    </section>}
  </>;
}
