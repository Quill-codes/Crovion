"use client";

import { useState } from "react";
import { BACKEND_URL } from "@/lib/content/config";
import { CONTACT } from "@/lib/contact";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * The lead form, as it opens off the CONTACT US sphere's FRM drop.
 *
 * Rendered inside drei's `Html`, so it is real DOM projected onto a moving blob:
 * it inherits the card's opacity gate and its `pointerEvents` switch, which is
 * why there is no enter animation of its own here. The panel appears when the
 * drop it belongs to has finished arriving.
 *
 * ── Width ──
 * 260px against the sibling detail line's 200. The detail line is one sentence
 * that may wrap to four lines; this is four controls that have to be typeable,
 * and at 200 the message box is narrower than the placeholder in it. It is still
 * positioned out of flow, so the extra width does not move the badge — the same
 * rule the name beside it follows.
 *
 * ── Failure ──
 * The backend is optional everywhere else on this page: the copy falls back to
 * built-in text when it is not running, silently. This is the one place that
 * cannot be silent, because a form that swallows a submission is worse than one
 * that is not there. So a failed send says so and keeps what was typed.
 *
 * A build with no backend configured (`BACKEND_URL` empty — the static export
 * before a service is deployed) does not try at all. The POST would go to
 * `/api/leads` on the static host, which has nothing there, and the answer would
 * be "Try again?" to a send that can never succeed. It points at the address
 * that does work instead, and still keeps what was typed so it can be copied.
 */
export default function ContactForm({ source }: { source: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<React.ReactNode>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;

    if (!BACKEND_URL) {
      setStatus("error");
      setErrors({});
      setMessage(
        <>
          The form is not connected yet. Write to{" "}
          <a href={CONTACT.emailHref} className="underline underline-offset-2">
            {CONTACT.email}
          </a>
          .
        </>
      );
      return;
    }

    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    setErrors({});
    setMessage("");

    try {
      const res = await fetch(`${BACKEND_URL}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          message: data.get("message"),
          // The honeypot, sent through as-is. It is a real field in the markup
          // below, hidden from people and from screen readers; anything that
          // fills it is answered 200 by the server and stored nowhere.
          company: data.get("company"),
          source,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        errors?: Record<string, string>;
      };

      if (res.ok && body.ok) {
        setStatus("sent");
        form.reset();
        return;
      }

      // 400 carries per-field errors; 429 and everything else carry one line.
      setStatus("error");
      setErrors(body.errors ?? {});
      setMessage(body.error ?? (body.errors ? "" : "That did not send. Try again?"));
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Try again in a moment.");
    }
  }

  if (status === "sent") {
    return (
      <div className="pt-2 text-[12px] leading-snug text-brand-text/80" role="status">
        Thank you — that arrived. We answer inside one working day.
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="block mt-2 underline underline-offset-2 hover:text-brand-text cursor-pointer"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="pt-2 flex flex-col gap-1.5" noValidate>
      <Field name="name" placeholder="Your name" error={errors.name} />
      <Field name="email" type="email" placeholder="Email" error={errors.email} />
      <Field name="phone" placeholder="Phone (optional)" />

      <textarea
        name="message"
        rows={3}
        placeholder="What do you need?"
        aria-label="Message"
        className={`w-full resize-none rounded-md bg-white/70 px-2 py-1.5 text-[12px] leading-snug text-brand-text
          placeholder:text-brand-text/40 outline-none ring-1 transition-shadow focus:ring-2 focus:ring-brand-text/40
          ${errors.message ? "ring-[#D6455F]/70" : "ring-white/70"}`}
      />
      {errors.message && <Hint>{errors.message}</Hint>}

      {/* Honeypot. Off-screen rather than `display:none`, because a bot that
          parses styles skips the latter; `aria-hidden` and `tabIndex={-1}` keep
          it away from anyone using a keyboard or a screen reader. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] w-px h-px opacity-0"
      />

      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-full bg-brand-text px-3.5 py-1.5 text-[11px] tracking-[0.08em] uppercase text-white
            transition-opacity hover:opacity-85 disabled:opacity-50 cursor-pointer disabled:cursor-default"
        >
          {status === "sending" ? "Sending…" : "Send"}
        </button>
        {message && <Hint>{message}</Hint>}
      </div>
    </form>
  );
}

function Field({
  name,
  type = "text",
  placeholder,
  error,
}: {
  name: string;
  type?: string;
  placeholder: string;
  error?: string;
}) {
  return (
    <>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`w-full rounded-md bg-white/70 px-2 py-1.5 text-[12px] text-brand-text
          placeholder:text-brand-text/40 outline-none ring-1 transition-shadow focus:ring-2 focus:ring-brand-text/40
          ${error ? "ring-[#D6455F]/70" : "ring-white/70"}`}
      />
      {error && <Hint>{error}</Hint>}
    </>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="text-[10.5px] leading-tight text-[#8C1F35]">{children}</span>;
}
