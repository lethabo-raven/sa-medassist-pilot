import { useEffect, useState } from "react";
import "./AnalyticsDashboard.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function token() {
  return sessionStorage.getItem("saMedassistToken") || localStorage.getItem("saMedassistToken") || "";
}

async function loadAnalytics() {
  const response = await fetch(`${API_BASE}/api/analytics-dashboard`, {
    headers: token() ? { Authorization: `Bearer ${token()}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Analytics failed with ${response.status}`);
  }
  return response.json();
}

function Card({ label, value, tone = "default" }) {
  return <section className={`ad-card tone-${tone}`}><span>{label}</span><strong>{value ?? 0}</strong></section>;
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState({ usage: {}, safety: {}, knowledge: {}, userMetrics: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await loadAnalytics());
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
    <main className="analytics-dashboard">
      <header className="ad-header">
        <div>
          <p>Analytics</p>
          <h1>Pilot Measurement Dashboard</h1>
          <span>Usage, safety, knowledge, and role-level activity metrics.</span>
        </div>
        <button type="button" onClick={refresh} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </header>

      {error ? <div className="ad-error">{error}</div> : null}

      <section className="ad-section">
        <h2>Usage</h2>
        <div className="ad-grid">
          <Card label="Questions Today" value={data.usage.questions_today} />
          <Card label="Questions This Month" value={data.usage.questions_this_month} />
          <Card label="Active Users" value={data.usage.active_users} />
        </div>
      </section>

      <section className="ad-section">
        <h2>Safety</h2>
        <div className="ad-grid">
          <Card label="Allergy Warnings" value={data.safety.allergy_warnings} tone="warning" />
          <Card label="Interaction Warnings" value={data.safety.interaction_warnings} tone="warning" />
          <Card label="Pharmacist Escalations" value={data.safety.pharmacist_escalations} tone="warning" />
          <Card label="Emergency Escalations" value={data.safety.emergency_escalations} tone="danger" />
        </div>
      </section>

      <section className="ad-section">
        <h2>Knowledge</h2>
        <div className="ad-grid">
          <Card label="Documents Uploaded" value={data.knowledge.documents_uploaded} />
          <Card label="Documents Approved" value={data.knowledge.documents_approved} />
          <Card label="Documents Rejected" value={data.knowledge.documents_rejected} tone="danger" />
          <Card label="Active Rules" value={data.knowledge.active_rules} />
        </div>
      </section>

      <section className="ad-section">
        <h2>User Metrics</h2>
        <div className="ad-role-list">
          {(data.userMetrics || []).map((item) => (
            <article key={item.role}>
              <strong>{String(item.role).replace(/_/g, " ")}</strong>
              <span>{item.usage_count}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
