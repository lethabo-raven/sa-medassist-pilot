import { useEffect, useState } from "react";
import "./KnowledgeManagement.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const CATEGORIES = ["ICD10", "Medical Aid Rules", "Medicine Schedules", "Formularies", "Clinical Guidelines", "SOPs", "Drug Interactions", "Dispensing Rules", "Pharmacy Operations"];

function token() {
  return sessionStorage.getItem("saMedassistToken") || localStorage.getItem("saMedassistToken") || "";
}

async function api(path, options = {}) {
  const headers = options.body instanceof FormData ? { ...(token() ? { Authorization: `Bearer ${token()}` } : {}) } : { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed with ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function Badge({ value }) {
  const normalized = String(value || "uploaded").toLowerCase().replace(/\s+/g, "-");
  return <span className={`km-badge status-${normalized}`}>{value || "Uploaded"}</span>;
}

export default function KnowledgeManagement() {
  const [documents, setDocuments] = useState([]);
  const [extractions, setExtractions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ title: "", category: "Clinical Guidelines", sourceOrganization: "", version: "", publicationDate: "", expiryDate: "" });
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadDocuments() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/knowledge-management/documents");
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  async function uploadDocument(event) {
    event.preventDefault();
    if (!file) return setError("Select a document first.");
    const body = new FormData();
    body.append("file", file);
    Object.entries(form).forEach(([key, value]) => body.append(key, value));
    setError("");
    setNotice("");
    try {
      await api("/api/knowledge-management/documents", { method: "POST", body });
      setNotice("Document uploaded and queued for processing/review.");
      setFile(null);
      setForm({ title: "", category: "Clinical Guidelines", sourceOrganization: "", version: "", publicationDate: "", expiryDate: "" });
      await loadDocuments();
    } catch (err) {
      setError(err.message);
    }
  }

  async function selectDocument(document) {
    setSelected(document);
    setError("");
    try {
      const data = await api(`/api/knowledge-management/documents/${document.id}/extractions`);
      setExtractions(data.extractions || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function reviewDocument(decision) {
    if (!selected) return;
    setError("");
    setNotice("");
    try {
      await api(`/api/knowledge-management/documents/${selected.id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      setNotice(decision === "approve" ? "Document approved and activated." : "Document rejected.");
      await loadDocuments();
      await selectDocument(selected);
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateExtraction(item, status) {
    setError("");
    setNotice("");
    try {
      await api(`/api/knowledge-management/documents/${selected.id}/extractions/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setNotice(`Extraction ${status}.`);
      await selectDocument(selected);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="knowledge-management">
      <header className="km-header">
        <div>
          <p>Knowledge Management</p>
          <h1>Clinical Knowledge Workflow</h1>
          <span>Upload, parse, extract, review, approve, and activate approved pharmacy knowledge.</span>
        </div>
        <button type="button" onClick={loadDocuments} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </header>

      {error ? <div className="km-alert km-error">{error}</div> : null}
      {notice ? <div className="km-alert km-success">{notice}</div> : null}

      <section className="km-grid">
        <form className="km-card km-upload" onSubmit={uploadDocument}>
          <h2>Upload Center</h2>
          <label>Document<input type="file" accept=".pdf,.docx,.xlsx,.csv" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
          <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>Source<input value={form.sourceOrganization} onChange={(event) => setForm({ ...form, sourceOrganization: event.target.value })} /></label>
          <label>Version<input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} /></label>
          <label>Publication Date<input type="date" value={form.publicationDate} onChange={(event) => setForm({ ...form, publicationDate: event.target.value })} /></label>
          <label>Expiry Date<input type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} /></label>
          <button type="submit">Upload</button>
        </form>

        <section className="km-card km-repository">
          <h2>Document Repository</h2>
          <div className="km-table">
            <table>
              <thead><tr><th>Title</th><th>Category</th><th>Source</th><th>Version</th><th>Publication</th><th>Expiry</th><th>Status</th></tr></thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id} onClick={() => selectDocument(document)}>
                    <td>{document.title || document.file_name}</td>
                    <td>{document.document_category || document.category}</td>
                    <td>{document.source_organization || "-"}</td>
                    <td>{document.version || "-"}</td>
                    <td>{document.publication_date || "-"}</td>
                    <td>{document.expiry_date || "-"}</td>
                    <td><Badge value={document.processing_status || document.approval_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="km-card km-review">
        <header>
          <div>
            <h2>Review Screen</h2>
            <p>{selected ? selected.title || selected.file_name : "Select a document to review extracted entities."}</p>
          </div>
          <div className="km-actions">
            <button type="button" disabled={!selected} onClick={() => reviewDocument("approve")}>Approve</button>
            <button type="button" disabled={!selected} onClick={() => reviewDocument("reject")}>Reject</button>
          </div>
        </header>
        <div className="km-extractions">
          {extractions.map((item) => (
            <article key={item.id}>
              <strong>{item.entity_type || "Entity"}</strong>
              <p>{item.extracted_value || item.entity_value || item.value}</p>
              <span>Confidence: {item.confidence_score ?? "n/a"}</span>
              <div className="km-actions">
                <button type="button" onClick={() => updateExtraction(item, "approved")}>Approve</button>
                <button type="button" onClick={() => updateExtraction(item, "pending")}>Edit Later</button>
                <button type="button" onClick={() => updateExtraction(item, "rejected")}>Reject</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
