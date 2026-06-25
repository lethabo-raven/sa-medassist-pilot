import { useEffect, useMemo, useState } from "react";
import "./SystemOwnerPortal.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
];

const emptyPharmacy = {
  pharmacyName: "",
  pharmacyCode: "",
  registrationNumber: "",
  province: "",
  address: "",
  manager: "",
  status: "active",
};

const emptyManager = {
  employeeNumber: "",
  fullName: "",
  email: "",
  cellphone: "",
  role: "pharmacy_manager",
  pharmacyId: "",
  pin: "",
};

function authHeaders() {
  const token = sessionStorage.getItem("saMedassistToken") || localStorage.getItem("saMedassistToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed with ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

function StatusPill({ status }) {
  const normalized = String(status || "unknown").toLowerCase();
  return <span className={`status-pill status-${normalized}`}>{status || "Unknown"}</span>;
}

function MetricCard({ label, value }) {
  return (
    <section className="metric-card" aria-label={label}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

export default function SystemOwnerPortal() {
  const [activeTab, setActiveTab] = useState("pharmacies");
  const [pharmacies, setPharmacies] = useState([]);
  const [managers, setManagers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [approvalQueue, setApprovalQueue] = useState([]);
  const [audits, setAudits] = useState([]);
  const [pharmacyForm, setPharmacyForm] = useState(emptyPharmacy);
  const [managerForm, setManagerForm] = useState(emptyManager);
  const [editingPharmacyId, setEditingPharmacyId] = useState(null);
  const [editingManagerId, setEditingManagerId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const metrics = useMemo(() => {
    const failedLogins = audits.filter((item) => item.event_type === "login_failed").length;
    const emergency = audits.filter((item) => item.emergency_red_flag || item.event_type === "emergency_red_flag").length;
    const allergies = audits.filter((item) => item.allergy_conflict || item.event_type === "allergy_conflict").length;
    const interactions = audits.filter((item) => item.interaction_detected || item.event_type === "interaction_detected").length;

    return {
      pharmacies: pharmacies.length,
      activePharmacies: pharmacies.filter((item) => item.status === "active").length,
      managers: managers.length,
      pendingKnowledge: approvalQueue.length,
      failedLogins,
      emergency,
      allergies,
      interactions,
    };
  }, [approvalQueue.length, audits, managers.length, pharmacies]);

  async function loadPortal() {
    setLoading(true);
    setError("");
    try {
      const [pharmacyData, managerData, documentData, queueData, auditData] = await Promise.allSettled([
        api("/api/system-owner/pharmacies"),
        api("/api/system-owner/managers"),
        api("/api/system-owner/knowledge/documents"),
        api("/api/system-owner/knowledge/approval-queue"),
        api("/api/audit?limit=100"),
      ]);

      if (pharmacyData.status === "fulfilled") {
        const rows = pharmacyData.value.pharmacies || pharmacyData.value.rows || pharmacyData.value || [];
        setPharmacies(Array.isArray(rows) ? rows : []);
      }

      if (managerData.status === "fulfilled") {
        const rows = managerData.value.managers || managerData.value.rows || managerData.value || [];
        setManagers(Array.isArray(rows) ? rows : []);
      }

      if (documentData.status === "fulfilled") {
        const rows = documentData.value.documents || documentData.value.rows || documentData.value || [];
        setDocuments(Array.isArray(rows) ? rows : []);
      }

      if (queueData.status === "fulfilled") {
        const rows = queueData.value.items || queueData.value.queue || queueData.value.rows || queueData.value || [];
        setApprovalQueue(Array.isArray(rows) ? rows : []);
      }

      if (auditData.status === "fulfilled") {
        const rows = auditData.value.auditLogs || auditData.value.logs || auditData.value.rows || auditData.value || [];
        setAudits(Array.isArray(rows) ? rows : []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPortal();
  }, []);

  function editPharmacy(pharmacy) {
    setEditingPharmacyId(pharmacy.id);
    setPharmacyForm({
      pharmacyName: pharmacy.pharmacy_name || pharmacy.pharmacyName || "",
      pharmacyCode: pharmacy.pharmacy_code || pharmacy.pharmacyCode || "",
      registrationNumber: pharmacy.registration_number || pharmacy.registrationNumber || "",
      province: pharmacy.province || "",
      address: pharmacy.address || "",
      manager: pharmacy.manager || pharmacy.manager_name || "",
      status: pharmacy.status || "active",
    });
  }

  async function savePharmacy(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    const payload = {
      pharmacyName: pharmacyForm.pharmacyName,
      pharmacyCode: pharmacyForm.pharmacyCode,
      registrationNumber: pharmacyForm.registrationNumber,
      province: pharmacyForm.province,
      address: pharmacyForm.address,
      manager: pharmacyForm.manager,
      status: pharmacyForm.status,
    };

    try {
      if (editingPharmacyId) {
        await api(`/api/system-owner/pharmacies/${editingPharmacyId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setNotice("Pharmacy updated.");
      } else {
        await api("/api/system-owner/pharmacies", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Pharmacy created.");
      }
      setPharmacyForm(emptyPharmacy);
      setEditingPharmacyId(null);
      await loadPortal();
    } catch (err) {
      setError(err.message);
    }
  }

  async function setPharmacyStatus(id, status) {
    setError("");
    setNotice("");
    try {
      await api(`/api/system-owner/pharmacies/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setNotice(status === "active" ? "Pharmacy reactivated." : "Pharmacy disabled.");
      await loadPortal();
    } catch (err) {
      setError(err.message);
    }
  }

  function editManager(manager) {
    setEditingManagerId(manager.id);
    setManagerForm({
      employeeNumber: manager.employee_number || manager.employeeNumber || "",
      fullName: manager.full_name || manager.fullName || "",
      email: manager.email || "",
      cellphone: manager.cellphone || "",
      role: manager.role || "pharmacy_manager",
      pharmacyId: manager.pharmacy_id || manager.pharmacyId || "",
      pin: "",
    });
  }

  async function saveManager(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const payload = {
        employeeNumber: managerForm.employeeNumber,
        fullName: managerForm.fullName,
        email: managerForm.email,
        cellphone: managerForm.cellphone,
        role: managerForm.role,
        jobTitle: "Pharmacy Manager",
        pin: managerForm.pin,
      };

      if (editingManagerId) {
        await api(`/api/system-owner/managers/${editingManagerId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setNotice("Manager updated.");
      } else {
        await api(`/api/system-owner/pharmacies/${managerForm.pharmacyId}/managers`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Manager created.");
      }
      setManagerForm(emptyManager);
      setEditingManagerId(null);
      await loadPortal();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetManagerPassword(managerId) {
    const pin = window.prompt("Enter a new 6-digit PIN for this manager.");
    if (!pin) return;
    setError("");
    setNotice("");
    try {
      await api(`/api/system-owner/managers/${managerId}/reset-pin`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      setNotice("Manager PIN reset.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function setManagerStatus(managerId, status) {
    setError("");
    setNotice("");
    try {
      await api(`/api/system-owner/managers/${managerId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setNotice(status === "active" ? "Manager reactivated." : "Manager disabled.");
      await loadPortal();
    } catch (err) {
      setError(err.message);
    }
  }

  async function reviewRule(item, decision) {
    setError("");
    setNotice("");
    try {
      await api(`/api/system-owner/knowledge/rules/${item.id}/${decision}`, {
        method: "POST",
        body: JSON.stringify({ reviewerNote: `System Owner ${decision}` }),
      });
      setNotice(`Rule ${decision}.`);
      await loadPortal();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="system-owner-portal">
      <div className="portal-shell">
        <aside className="portal-sidebar" aria-label="System Owner navigation">
          <div className="portal-brand">
            <strong>SA MedAssist</strong>
            <span>Clinical governance</span>
          </div>
          <nav className="portal-side-nav">
            {[
              ["pharmacies", "Pharmacies"],
              ["managers", "Managers"],
              ["knowledge", "Knowledge"],
              ["audit", "Audit"],
            ].map(([key, label]) => (
              <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="portal-main">
      <header className="portal-header">
        <div>
          <p className="eyebrow">System Owner Portal</p>
          <h1>SA MedAssist Administration</h1>
          <p>Manage pharmacy tenants, pharmacy managers, approved knowledge, and clinical governance audit trails.</p>
        </div>
        <button type="button" onClick={loadPortal} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <section className="metrics-grid">
        <MetricCard label="Pharmacies" value={metrics.pharmacies} />
        <MetricCard label="Active Pharmacies" value={metrics.activePharmacies} />
        <MetricCard label="Managers" value={metrics.managers} />
        <MetricCard label="Pending Knowledge" value={metrics.pendingKnowledge} />
        <MetricCard label="Failed Logins" value={metrics.failedLogins} />
        <MetricCard label="Allergy Escalations" value={metrics.allergies} />
        <MetricCard label="Interaction Escalations" value={metrics.interactions} />
        <MetricCard label="Emergency Escalations" value={metrics.emergency} />
      </section>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}

      <nav className="portal-tabs" aria-label="System Owner sections">
        {[
          ["pharmacies", "Pharmacies"],
          ["managers", "Managers"],
          ["knowledge", "Knowledge Monitoring"],
          ["audit", "Audit Monitoring"],
        ].map(([key, label]) => (
          <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "pharmacies" ? (
        <section className="portal-section">
          <form className="portal-form" onSubmit={savePharmacy}>
            <h2>{editingPharmacyId ? "Edit Pharmacy" : "Create Pharmacy"}</h2>
            <label>
              Pharmacy Name
              <input required value={pharmacyForm.pharmacyName} onChange={(event) => setPharmacyForm({ ...pharmacyForm, pharmacyName: event.target.value })} />
            </label>
            <label>
              Pharmacy Code
              <input required value={pharmacyForm.pharmacyCode} onChange={(event) => setPharmacyForm({ ...pharmacyForm, pharmacyCode: event.target.value })} />
            </label>
            <label>
              Registration Number
              <input value={pharmacyForm.registrationNumber} onChange={(event) => setPharmacyForm({ ...pharmacyForm, registrationNumber: event.target.value })} />
            </label>
            <label>
              Province
              <select value={pharmacyForm.province} onChange={(event) => setPharmacyForm({ ...pharmacyForm, province: event.target.value })}>
                <option value="">Select province</option>
                {PROVINCES.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Address
              <textarea value={pharmacyForm.address} onChange={(event) => setPharmacyForm({ ...pharmacyForm, address: event.target.value })} />
            </label>
            <label>
              Manager
              <input value={pharmacyForm.manager} onChange={(event) => setPharmacyForm({ ...pharmacyForm, manager: event.target.value })} />
            </label>
            <label>
              Status
              <select value={pharmacyForm.status} onChange={(event) => setPharmacyForm({ ...pharmacyForm, status: event.target.value })}>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <div className="form-actions">
              <button type="submit">{editingPharmacyId ? "Save Pharmacy" : "Create Pharmacy"}</button>
              {editingPharmacyId ? (
                <button type="button" className="secondary" onClick={() => { setEditingPharmacyId(null); setPharmacyForm(emptyPharmacy); }}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pharmacy</th>
                  <th>Code</th>
                  <th>Registration</th>
                  <th>Province</th>
                  <th>Manager</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pharmacies.map((pharmacy) => (
                  <tr key={pharmacy.id}>
                    <td>{pharmacy.pharmacy_name || pharmacy.pharmacyName}</td>
                    <td>{pharmacy.pharmacy_code || pharmacy.pharmacyCode}</td>
                    <td>{pharmacy.registration_number || pharmacy.registrationNumber || "-"}</td>
                    <td>{pharmacy.province || "-"}</td>
                    <td>{pharmacy.manager || pharmacy.manager_name || "-"}</td>
                    <td><StatusPill status={pharmacy.status} /></td>
                    <td>{pharmacy.created_at ? new Date(pharmacy.created_at).toLocaleDateString() : "-"}</td>
                    <td className="row-actions">
                      <button type="button" onClick={() => editPharmacy(pharmacy)}>Edit</button>
                      {pharmacy.status === "active" ? (
                        <button type="button" onClick={() => setPharmacyStatus(pharmacy.id, "disabled")}>Disable</button>
                      ) : (
                        <button type="button" onClick={() => setPharmacyStatus(pharmacy.id, "active")}>Reactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "managers" ? (
        <section className="portal-section">
          <form className="portal-form" onSubmit={saveManager}>
            <h2>{editingManagerId ? "Edit Manager" : "Create Manager"}</h2>
            <label>
              Employee Number
              <input required value={managerForm.employeeNumber} onChange={(event) => setManagerForm({ ...managerForm, employeeNumber: event.target.value })} />
            </label>
            <label>
              Full Name
              <input required value={managerForm.fullName} onChange={(event) => setManagerForm({ ...managerForm, fullName: event.target.value })} />
            </label>
            <label>
              Email
              <input type="email" value={managerForm.email} onChange={(event) => setManagerForm({ ...managerForm, email: event.target.value })} />
            </label>
            <label>
              Cellphone
              <input value={managerForm.cellphone} onChange={(event) => setManagerForm({ ...managerForm, cellphone: event.target.value })} />
            </label>
            <label>
              Pharmacy
              <select required value={managerForm.pharmacyId} onChange={(event) => setManagerForm({ ...managerForm, pharmacyId: event.target.value })}>
                <option value="">Select pharmacy</option>
                {pharmacies.map((pharmacy) => (
                  <option key={pharmacy.id} value={pharmacy.id}>
                    {pharmacy.pharmacy_name || pharmacy.pharmacyName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <select value={managerForm.role} onChange={(event) => setManagerForm({ ...managerForm, role: event.target.value })}>
                <option value="pharmacy_manager">Pharmacy Manager</option>
              </select>
            </label>
            {!editingManagerId ? (
              <label>
                Initial PIN
                <input required pattern="[0-9]{6}" maxLength="6" value={managerForm.pin} onChange={(event) => setManagerForm({ ...managerForm, pin: event.target.value })} />
              </label>
            ) : null}
            <div className="form-actions">
              <button type="submit">{editingManagerId ? "Save Manager" : "Create Manager"}</button>
              {editingManagerId ? (
                <button type="button" className="secondary" onClick={() => { setEditingManagerId(null); setManagerForm(emptyManager); }}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee Number</th>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Cellphone</th>
                  <th>Role</th>
                  <th>Pharmacy</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((manager) => (
                  <tr key={manager.id}>
                    <td>{manager.employee_number || manager.employeeNumber}</td>
                    <td>{manager.full_name || manager.fullName}</td>
                    <td>{manager.email || "-"}</td>
                    <td>{manager.cellphone || "-"}</td>
                    <td>{manager.role || "pharmacy_manager"}</td>
                    <td>{manager.pharmacy_name || manager.pharmacyName || "-"}</td>
                    <td><StatusPill status={manager.status} /></td>
                    <td className="row-actions">
                      <button type="button" onClick={() => editManager(manager)}>Edit</button>
                      <button type="button" onClick={() => resetManagerPassword(manager.id)}>Reset PIN</button>
                      {manager.status === "active" ? (
                        <button type="button" onClick={() => setManagerStatus(manager.id, "disabled")}>Disable</button>
                      ) : (
                        <button type="button" onClick={() => setManagerStatus(manager.id, "active")}>Reactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "knowledge" ? (
        <section className="portal-section">
          <div className="split-grid">
            <div>
              <h2>Uploaded Documents</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Source</th>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Processing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((document) => (
                      <tr key={document.id}>
                        <td>{document.title || document.file_name || "Untitled"}</td>
                        <td>{document.source_organization || document.source_name || "-"}</td>
                        <td>{document.version || "-"}</td>
                        <td><StatusPill status={document.approval_status || document.status} /></td>
                        <td>{document.processing_status || document.processingStatus || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2>Approval Queue</h2>
              <div className="queue-list">
                {approvalQueue.map((item) => (
                  <article key={item.id} className="queue-item">
                    <header>
                      <strong>{item.rule_type || item.entity_type || "Rule"}</strong>
                      <StatusPill status={item.approval_status || "pending"} />
                    </header>
                    <p>{item.summary || item.extracted_text || item.value || "Pending extracted rule review."}</p>
                    <dl>
                      <dt>Source</dt>
                      <dd>{item.source_name || item.document_title || "-"}</dd>
                      <dt>Reference</dt>
                      <dd>{item.source_reference || item.section_heading || "-"}</dd>
                    </dl>
                    <div className="row-actions">
                      <button type="button" onClick={() => reviewRule(item, "approve")}>Approve</button>
                      <button type="button" onClick={() => reviewRule(item, "reject")}>Reject</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "audit" ? (
        <section className="portal-section">
          <h2>Audit Monitoring</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Actor</th>
                  <th>Pharmacy</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((item) => (
                  <tr key={item.id}>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleString() : "-"}</td>
                    <td>{item.event_type}</td>
                    <td>{item.actor || item.employee_number || "-"}</td>
                    <td>{item.pharmacy_name || item.pharmacy_id || "-"}</td>
                    <td>{item.question || item.metadata?.reason || item.metadata?.message || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
        </div>
      </div>
    </main>
  );
}
