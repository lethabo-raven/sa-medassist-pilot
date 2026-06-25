import { useEffect, useMemo, useState } from "react";
import "./PharmacyManagerPortal.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const emptyEmployee = {
  employeeNumber: "",
  fullName: "",
  role: "pharmacist",
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

function StatusBadge({ status }) {
  const normalized = String(status || "unknown").toLowerCase().replace(/\s+/g, "-");
  return <span className={`manager-status status-${normalized}`}>{status || "Unknown"}</span>;
}

function Metric({ label, value, tone = "default" }) {
  return (
    <section className={`manager-metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function roleLabel(role) {
  if (role === "pharmacy_manager") return "Pharmacy Manager";
  if (role === "pharmacy_assistant") return "Pharmacy Assistant";
  if (role === "pharmacist_assistant") return "Pharmacist Assistant";
  if (role === "pharmacist") return "Pharmacist";
  return role || "Pharmacy Assistant";
}

export default function PharmacyManagerPortal() {
  const [dashboard, setDashboard] = useState({
    activeEmployees: 0,
    questionsAskedToday: 0,
    escalations: 0,
    interactionWarnings: 0,
    allergyWarnings: 0,
    pendingApprovals: 0,
  });
  const [employees, setEmployees] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(emptyEmployee);
  const [editingId, setEditingId] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const activeEmployees = useMemo(() => employees.filter((employee) => employee.status === "active"), [employees]);

  async function loadManagerPortal() {
    setLoading(true);
    setError("");
    try {
      const [dashboardData, employeeData] = await Promise.all([
        api("/api/pharmacy-manager/dashboard"),
        api("/api/pharmacy-manager/employees"),
      ]);
      setDashboard(dashboardData.dashboard || dashboardData);
      setEmployees(employeeData.employees || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadManagerPortal();
  }, []);

  function startEdit(employee) {
    setEditingId(employee.id);
    setForm({
      employeeNumber: employee.employee_number || employee.employeeNumber || "",
      fullName: employee.full_name || employee.fullName || "",
      role: employee.role || "pharmacist",
      pin: "",
    });
  }

  async function saveEmployee(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      if (editingId) {
        await api(`/api/pharmacy-manager/employees/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            employeeNumber: form.employeeNumber,
            fullName: form.fullName,
            role: form.role,
          }),
        });
        setNotice("Employee updated.");
      } else {
        await api("/api/pharmacy-manager/employees", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setNotice("Employee added.");
      }
      setForm(emptyEmployee);
      setEditingId(null);
      await loadManagerPortal();
    } catch (err) {
      setError(err.message);
    }
  }

  async function setEmployeeStatus(employee, status) {
    setError("");
    setNotice("");
    try {
      await api(`/api/pharmacy-manager/employees/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setNotice(status === "active" ? "Employee reactivated." : "Employee disabled.");
      await loadManagerPortal();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetPin(employee) {
    const pin = window.prompt("Enter a new 6-digit PIN.");
    if (!pin) return;
    setError("");
    setNotice("");
    try {
      await api(`/api/pharmacy-manager/employees/${employee.id}/reset-pin`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      setNotice("PIN reset. Employee must reset on next login.");
      await loadManagerPortal();
    } catch (err) {
      setError(err.message);
    }
  }

  async function viewHistory(employee) {
    setSelectedEmployee(employee);
    setError("");
    try {
      const data = await api(`/api/pharmacy-manager/employees/${employee.id}/history`);
      setHistory(data.history || []);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="manager-portal">
      <aside className="manager-sidebar">
        <div className="manager-brand">
          <strong>SA MedAssist</strong>
          <span>Pharmacy Manager</span>
        </div>
        <nav>
          <a href="#dashboard">Dashboard</a>
          <a href="#employees">Employees</a>
          <a href="#history">History</a>
        </nav>
      </aside>

      <section className="manager-main">
        <header className="manager-header" id="dashboard">
          <div>
            <p className="manager-eyebrow">Manager Dashboard</p>
            <h1>Pharmacy Operations</h1>
            <p>Manage staff access, monitor safety escalations, and review daily activity for your pharmacy.</p>
          </div>
          <button type="button" onClick={loadManagerPortal} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        {error ? <div className="manager-alert alert-error">{error}</div> : null}
        {notice ? <div className="manager-alert alert-success">{notice}</div> : null}

        <section className="manager-metrics" aria-label="Manager metrics">
          <Metric label="Active Employees" value={dashboard.activeEmployees ?? activeEmployees.length} />
          <Metric label="Questions Today" value={dashboard.questionsAskedToday || 0} />
          <Metric label="Escalations" value={dashboard.escalations || 0} tone="warning" />
          <Metric label="Interaction Warnings" value={dashboard.interactionWarnings || 0} tone="warning" />
          <Metric label="Allergy Warnings" value={dashboard.allergyWarnings || 0} tone="warning" />
          <Metric label="Pending Approvals" value={dashboard.pendingApprovals || 0} />
        </section>

        <section className="manager-grid" id="employees">
          <form className="employee-form" onSubmit={saveEmployee}>
            <h2>{editingId ? "Edit Employee" : "Add Employee"}</h2>
            <label>
              Employee Number
              <input required value={form.employeeNumber} onChange={(event) => setForm({ ...form, employeeNumber: event.target.value })} />
            </label>
            <label>
              Full Name
              <input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="pharmacist">Pharmacist</option>
                <option value="pharmacist_assistant">Pharmacist Assistant</option>
                <option value="pharmacy_assistant">Pharmacy Assistant</option>
                <option value="pharmacy_manager">Pharmacy Manager</option>
              </select>
            </label>
            {!editingId ? (
              <label>
                Initial PIN
                <input required pattern="[0-9]{6}" maxLength="6" value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value })} />
              </label>
            ) : null}
            <div className="manager-actions">
              <button type="submit">{editingId ? "Save Employee" : "Add Employee"}</button>
              {editingId ? (
                <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(emptyEmployee); }}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <div className="employee-table">
            <div className="table-title">
              <h2>Employees</h2>
              <span>{employees.length} total</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Employee Number</th>
                    <th>Full Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>PIN Reset</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td>{employee.employee_number || employee.employeeNumber}</td>
                      <td>{employee.full_name || employee.fullName}</td>
                      <td>{roleLabel(employee.role)}</td>
                      <td><StatusBadge status={employee.status} /></td>
                      <td>{employee.must_reset_pin ? "Required" : "No"}</td>
                      <td className="manager-row-actions">
                        <button type="button" onClick={() => startEdit(employee)}>Edit</button>
                        <button type="button" onClick={() => resetPin(employee)}>Reset PIN</button>
                        <button type="button" onClick={() => viewHistory(employee)}>History</button>
                        {employee.status === "active" ? (
                          <button type="button" onClick={() => setEmployeeStatus(employee, "disabled")}>Disable</button>
                        ) : (
                          <button type="button" onClick={() => setEmployeeStatus(employee, "active")}>Reactivate</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="history-panel" id="history">
          <div>
            <p className="manager-eyebrow">Employee History</p>
            <h2>{selectedEmployee ? selectedEmployee.full_name || selectedEmployee.fullName : "Select an employee"}</h2>
          </div>
          <div className="history-list">
            {history.length === 0 ? (
              <p>No employee history selected.</p>
            ) : (
              history.map((item) => (
                <article key={item.id}>
                  <strong>{item.event_type}</strong>
                  <span>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</span>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
