import { useState } from "react";
import "./KnowledgeSearch.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const TYPES = ["medicine", "icd10", "nappi", "interaction", "guideline"];

function token() {
  return sessionStorage.getItem("saMedassistToken") || localStorage.getItem("saMedassistToken") || "";
}

async function searchKnowledge(q, type) {
  const response = await fetch(`${API_BASE}/api/knowledge-search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`, {
    headers: token() ? { Authorization: `Bearer ${token()}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Search failed with ${response.status}`);
  }
  return response.json();
}

export default function KnowledgeSearch() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("medicine");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await searchKnowledge(q, type);
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="knowledge-search">
      <header className="ks-header">
        <p>Knowledge Search</p>
        <h1>Approved Source Lookup</h1>
        <span>Search approved active documents and structured extracted knowledge.</span>
      </header>

      <form className="ks-search-card" onSubmit={submit}>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {TYPES.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
        </select>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search medicine, ICD-10, NAPPI, interaction, or guideline" />
        <button type="submit" disabled={loading || !q.trim()}>{loading ? "Searching..." : "Search"}</button>
      </form>

      {error ? <div className="ks-error">{error}</div> : null}

      <section className="ks-results">
        {results.map((result) => (
          <article key={result.id} className="ks-result-card">
            <div>
              <span className="ks-type">{result.entity_type || type}</span>
              <h2>{result.match_text || result.document_title}</h2>
              <p>{result.document_title}</p>
            </div>
            <div className="ks-meta">
              <span>Confidence: {result.confidence_score ?? "n/a"}</span>
              <span>Source: {result.source_organization || "Approved document"}</span>
              <span>Version: {result.version || "n/a"}</span>
              <span>Citation: {result.section_heading || result.page_number || result.source_url || "Reference available"}</span>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
