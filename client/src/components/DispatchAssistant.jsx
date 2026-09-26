import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, MessageCircle, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAppAuth } from '../lib/AuthContext.jsx';

const welcomeMessage = { id: 'welcome', role: 'assistant', content: 'Paste a buyer’s details here, even if they are just a few lines. I’ll prepare a buyer form for you to review. You can also ask me to edit a buyer or look up an LBC branch or ZIP code.' };

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
    )) return saved.length ? saved : [welcomeMessage];
  } catch {
    // A blocked or invalid browser store should not prevent the chat from opening.
  }
  return [welcomeMessage];
}

export default function DispatchAssistant() {
  const { id: userId } = useAppAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => loadMessages(userId));
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
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

  async function send(event) {
    event.preventDefault();
    const content = value.trim();
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
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: data?.message || 'I could not complete that request.', existingBuyerId: data?.existingBuyerId }]);
      if (data?.draft) {
        setOpen(false);
        navigate('/buyers/new', { state: { buyerDraft: data.draft, draftNotice: data.message, draftSourceUrl: data.sourceUrl, draftGoogleSearchUrl: data.googleSearchUrl } });
      }
    } catch {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: 'The assistant is unavailable right now. Please try again.' }]);
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
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
        {messages.map((message) => <div key={message.id} className={`assistant-message ${message.role}`}>{message.content.replaceAll('**', '')}{message.existingBuyerId && <button type="button" className="assistant-result-link" onClick={() => { setOpen(false); navigate(`/buyers/${message.existingBuyerId}`); }}>Open buyer</button>}</div>)}
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
