import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function token() {
  return sessionStorage.getItem("saMedassistToken") || localStorage.getItem("saMedassistToken") || "";
}

export default function AnswerFeedback({ answerId, response }) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");

  async function submit(rating) {
    setSelected(rating);
    setError("");
    const res = await fetch(`${API_BASE}/api/feedback-review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      },
      body: JSON.stringify({ answerId, response, rating }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Feedback failed");
      setSelected("");
    }
  }

  return (
    <div className="answer-feedback" aria-label="Answer feedback">
      <button type="button" className={selected === "thumbs_up" ? "active" : ""} onClick={() => submit("thumbs_up")}>Thumbs Up</button>
      <button type="button" className={selected === "thumbs_down" ? "active" : ""} onClick={() => submit("thumbs_down")}>Thumbs Down</button>
      {error ? <span>{error}</span> : null}
    </div>
  );
}
