import { useEffect, useState } from "react";
import "./FeedbackReview.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function token() {
  return sessionStorage.getItem("saMedassistToken") || localStorage.getItem("saMedassistToken") || "";
}

async function loadFeedback() {
  const response = await fetch(`${API_BASE}/api/feedback-review`, {
    headers: token() ? { Authorization: `Bearer ${token()}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Feedback failed with ${response.status}`);
  }
  return response.json();
}

export default function FeedbackReview() {
  const [feedback, setFeedback] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const data = await loadFeedback();
      setFeedback(data.feedback || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="feedback-review">
      <header className="fr-header">
        <div>
          <p>Feedback</p>
          <h1>Answer Feedback Review</h1>
          <span>Managers review their pharmacy feedback. System Owners can review all feedback.</span>
        </div>
        <button type="button" onClick={refresh} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </header>

      {error ? <div className="fr-error">{error}</div> : null}

      <section className="fr-list">
        {feedback.map((item) => (
          <article key={item.id}>
            <header>
              <strong>{String(item.rating).replace(/_/g, " ")}</strong>
              <span>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</span>
            </header>
            <p>{item.response_snapshot || item.comment || "No response snapshot stored."}</p>
            <dl>
              <dt>User Role</dt><dd>{item.user_role || "-"}</dd>
              <dt>Pharmacy</dt><dd>{item.pharmacy_id || "-"}</dd>
            </dl>
          </article>
        ))}
      </section>
    </main>
  );
}
