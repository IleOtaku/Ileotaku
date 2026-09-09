"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Send } from "lucide-react";
import { submitContactMessage } from "@/lib/admin";
import { useAuth } from "@/hooks/useAuth";

/** /contact's message form — works signed out (a locked-out or prospective user is exactly who
 * most needs to reach support), pre-filling name/email for a signed-in visitor. */
export default function ContactForm() {
  const { user, profile } = useAuth();
  const [name, setName] = useState(profile?.displayName ?? user?.displayName ?? "");
  const [email, setEmail] = useState(profile?.email ?? user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      await submitContactMessage({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });
      setSent(true);
      setSubject("");
      setMessage("");
      toast.success("Message sent — we'll get back to you soon!");
    } catch {
      toast.error("Couldn't send your message. Please try again, or email us directly.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-green/30 bg-green/10 p-6 text-center">
        <p className="font-syne text-sm font-semibold text-green2">Message sent!</p>
        <p className="mt-1 font-noto text-xs text-muted">
          Thanks for reaching out — our team typically replies within 1-2 business days.
        </p>
        <button type="button" onClick={() => setSent(false)} className="btn-ghost mt-4 text-xs">
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="input-base text-sm"
          required
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          className="input-base text-sm"
          required
        />
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="input-base text-sm"
        required
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={5}
        placeholder="How can we help?"
        className="input-base resize-none text-sm"
        required
      />
      <button
        type="submit"
        disabled={submitting || !name.trim() || !email.trim() || !subject.trim() || !message.trim()}
        className="btn-primary mt-1 flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send Message
      </button>
    </form>
  );
}
