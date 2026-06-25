import { useEffect, useMemo, useRef, useState } from "react";
import { ROLE_LABELS, SECTION_LABELS, canUseAdminTools, normalizeRole, sectionsForRole } from "../auth/rolePermissions.js";
import "./FloatingWorkspace.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const BRAND_NAME = "Axian";
const BRAND_TAGLINE = "Powered by Synexis Technologies";

function workspaceMode(section) {
  if (section === "chat" || section === "account") return "compact";
  return "admin";
}


async function api(path, options = {}, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed with ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

function safetyTone(message) {
  const text = JSON.stringify(message || {}).toLowerCase();
  if (text.includes("emergency") || text.includes("contraindicated") || text.includes("severe allergy")) return "red";
  if (text.includes("pharmacist review") || text.includes("interaction") || text.includes("allergy")) return "orange";
  return "green";
}

export default function FloatingWorkspace() {
  const [open, setOpen] = useState(false);
  const [renderWorkspace, setRenderWorkspace] = useState(false);
  const [closing, setClosing] = useState(false);
  const [token, setToken] = useState(sessionStorage.getItem("saMedassistToken") || localStorage.getItem("saMedassistToken") || "");
  const [profile, setProfile] = useState(() => {
    const stored = sessionStorage.getItem("saMedassistProfile");
    return stored ? JSON.parse(stored) : null;
  });
  const [login, setLogin] = useState({ pharmacyCode: "", employeeNumber: "", pin: "" });
  const [activeSection, setActiveSection] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [accountPin, setAccountPin] = useState({ currentPin: "", newPin: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const loginFirstFieldRef = useRef(null);
  const messageInputRef = useRef(null);
  const dragRef = useRef({ dragging: false, moved: false, offsetX: 0, offsetY: 0 });
  const [launcherPosition, setLauncherPosition] = useState(() => {
    const saved = localStorage.getItem("axianLauncherPosition");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    if (typeof window === "undefined") return { x: 24, y: 24, side: "right" };
    return { x: Math.max(16, window.innerWidth - 164), y: Math.max(16, window.innerHeight - 88), side: "right" };
  });

  const role = normalizeRole(profile?.role || profile?.jobTitle || profile?.job_title);
  const displayRole = normalizeRole(profile?.jobTitle || profile?.job_title || profile?.role);
  const sections = useMemo(() => sectionsForRole(role), [role]);
  const adminSections = useMemo(() => sections.filter((section) => !["chat", "account"].includes(section)), [sections]);
  const mode = workspaceMode(activeSection);
  const showAdminSidebar = token && canUseAdminTools(role) && adminSections.length > 0;
  const panelStyle = useMemo(() => {
    if (typeof window === "undefined") return {};
    const viewportPadding = window.innerWidth <= 760 ? 8 : 16;
    const launcherWidth = 140;
    const launcherHeight = 56;
    const maxPanelWidth = mode === "admin" ? 920 : 448;
    const panelWidth = Math.min(maxPanelWidth, window.innerWidth - viewportPadding * 2);
    const panelHeight = Math.min(760, window.innerHeight - viewportPadding * 2);
    const opensFromLeft = (launcherPosition.side || "right") === "left";
    const preferredLeft = opensFromLeft
      ? launcherPosition.x + launcherWidth + 12
      : launcherPosition.x - panelWidth - 12;
    const fallbackLeft = opensFromLeft
      ? launcherPosition.x
      : launcherPosition.x + launcherWidth - panelWidth;
    const unclampedLeft = preferredLeft < viewportPadding || preferredLeft + panelWidth > window.innerWidth - viewportPadding
      ? fallbackLeft
      : preferredLeft;
    const preferredTop = launcherPosition.y + launcherHeight - panelHeight;
    const left = Math.min(Math.max(unclampedLeft, viewportPadding), window.innerWidth - panelWidth - viewportPadding);
    const top = Math.min(Math.max(preferredTop, viewportPadding), window.innerHeight - panelHeight - viewportPadding);
    return {
      width: `${panelWidth}px`,
      height: `${panelHeight}px`,
      left: `${left}px`,
      top: `${top}px`,
    };
  }, [launcherPosition, mode]);

  useEffect(() => {
    if (open) {
      setRenderWorkspace(true);
      setClosing(false);
    } else if (renderWorkspace) {
      setClosing(true);
      const timer = window.setTimeout(() => {
        setRenderWorkspace(false);
        setClosing(false);
      }, 280);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open, renderWorkspace]);

  useEffect(() => {
    if (renderWorkspace && !token) {
      window.setTimeout(() => loginFirstFieldRef.current?.focus(), 80);
    }
    if (renderWorkspace && token && activeSection === "chat") {
      window.setTimeout(() => messageInputRef.current?.focus(), 120);
    }
  }, [renderWorkspace, token, activeSection]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api("/api/workspace/me", {}, token)
      .then((data) => {
        if (cancelled) return;
        const nextProfile = data.profile || data.employee || data.user || profile;
        if (nextProfile) {
          setProfile(nextProfile);
          sessionStorage.setItem("saMedassistProfile", JSON.stringify(nextProfile));
        }
      })
      .catch(() => {
        sessionStorage.removeItem("saMedassistToken");
        sessionStorage.removeItem("saMedassistProfile");
        localStorage.removeItem("saMedassistToken");
        localStorage.removeItem("saMedassistProfile");
        if (!cancelled) {
          setToken("");
          setProfile(null);
          setError("Your session has expired. Please sign in again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    function keepLauncherVisible() {
      setLauncherPosition((position) => {
        const width = 140;
        const height = 56;
        const next = {
          ...position,
          x: Math.min(Math.max(position?.x ?? 16, 12), window.innerWidth - width - 12),
          y: Math.min(Math.max(position?.y ?? 16, 12), window.innerHeight - height - 12),
        };
        localStorage.setItem("axianLauncherPosition", JSON.stringify(next));
        return next;
      });
    }
    window.addEventListener("resize", keepLauncherVisible);
    return () => window.removeEventListener("resize", keepLauncherVisible);
  }, []);

  function toggleWorkspace() {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    setOpen((value) => !value);
  }

  function beginDrag(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      dragging: true,
      moved: false,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveLauncher(event) {
    if (!dragRef.current.dragging) return;
    const width = 140;
    const height = 56;
    const x = Math.min(Math.max(event.clientX - dragRef.current.offsetX, 12), window.innerWidth - width - 12);
    const y = Math.min(Math.max(event.clientY - dragRef.current.offsetY, 12), window.innerHeight - height - 12);
    if (Math.abs(x - launcherPosition.x) > 2 || Math.abs(y - launcherPosition.y) > 2) {
      dragRef.current.moved = true;
    }
    setLauncherPosition({ x, y, side: x < window.innerWidth / 2 ? "left" : "right" });
  }

  function endDrag(event) {
    if (!dragRef.current.dragging) return;
    const width = 140;
    const height = 56;
    const side = launcherPosition.x < window.innerWidth / 2 ? "left" : "right";
    const snapped = {
      x: side === "left" ? 12 : window.innerWidth - width - 12,
      y: Math.min(Math.max(launcherPosition.y, 12), window.innerHeight - height - 12),
      side,
    };
    dragRef.current.dragging = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setLauncherPosition(snapped);
    localStorage.setItem("axianLauncherPosition", JSON.stringify(snapped));
  }

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(login),
      });
      const nextToken = data.token || data.sessionToken || data.accessToken;
      const nextProfile = data.employee || data.profile || data.user || {};
      if (!nextToken) throw new Error("Login response did not include a session token");
      setToken(nextToken);
      setProfile(nextProfile);
      sessionStorage.setItem("saMedassistToken", nextToken);
      sessionStorage.setItem("saMedassistProfile", JSON.stringify(nextProfile));
      setActiveSection("chat");
      setNotice("Signed in.");
    } catch (err) {
      const message = String(err.message || "").toLowerCase();
      if (message.includes("401") || message.includes("invalid") || message.includes("unauthorized")) {
        setError("We could not verify those login details. Check the pharmacy code, employee number, and PIN.");
      } else if (message.includes("locked")) {
        setError("This account is temporarily locked after repeated sign-in attempts. Please ask your manager to reset access.");
      } else {
        setError("Axian could not sign you in right now. Please check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendQuestion(event) {
    event.preventDefault();
    if (!question.trim()) return;
    const userMessage = { role: "user", content: question };
    setMessages((items) => [...items, userMessage]);
    setQuestion("");
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({ question, patientContext: {} }),
      }, token);
      setMessages((items) => [...items, {
        role: "assistant",
        content: data.answer || data.message || "No answer returned.",
        explanation: data.explanation || data.rationale || "",
        citations: data.citations || [],
        confidence: data.confidence || data.retrievalConfidence,
        reviewNotes: data.reviewNotes || data.review_notes || data.metadata?.reviewNotes || "",
        safety: data.safety || data.flags || {},
      }]);
    } catch (err) {
      setMessages((items) => [...items, {
        role: "assistant",
        content: "I could not complete that request.",
        safety: { warning: err.message },
        citations: [],
      }]);
    } finally {
      setBusy(false);
    }
  }

  async function changePin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/auth/reset-own-pin", {
        method: "POST",
        body: JSON.stringify(accountPin),
      }, token);
      setAccountPin({ currentPin: "", newPin: "" });
      setNotice("PIN updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem("saMedassistToken");
    sessionStorage.removeItem("saMedassistProfile");
    localStorage.removeItem("saMedassistToken");
    localStorage.removeItem("saMedassistProfile");
    setToken("");
    setProfile(null);
    setMessages([]);
    setActiveSection("chat");
    setNotice("");
  }

  return (
    <div
      className={`floating-workspace-root axian-root launcher-${launcherPosition.side || "right"}`}
      style={{ left: `${launcherPosition.x}px`, top: `${launcherPosition.y}px` }}
    >
      <button
        className="floating-workspace-launcher"
        type="button"
        onClick={toggleWorkspace}
        onPointerDown={beginDrag}
        onPointerMove={moveLauncher}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-expanded={open}
      >
        <span className="axian-launch-mark">A</span>
        <span className="axian-launch-label">{BRAND_NAME}</span>
      </button>

      {renderWorkspace ? (
        <section
          className={`floating-workspace workspace-${mode} ${closing ? "workspace-closing" : ""} ${showAdminSidebar ? "workspace-with-sidebar" : "workspace-chat-only"}`}
          style={panelStyle}
          aria-label="Axian workspace"
        >
          {!token ? (
            <form className="workspace-login" onSubmit={handleLogin}>
              <header>
                <div className="axian-brand-lockup">
                  <span className="axian-mark">A</span>
                  <div>
                    <strong>{BRAND_NAME}</strong>
                    <small>{BRAND_TAGLINE}</small>
                  </div>
                </div>
              </header>
              <div className="workspace-login-body">
                <p>Clinical decision-support only. Not a replacement for professional judgement.</p>
                {error ? <div className="workspace-alert alert-error">{error}</div> : null}
                <label>
                  Pharmacy Code
                  <span className="workspace-input-shell">
                    <span aria-hidden="true">🏥</span>
                    <input ref={loginFirstFieldRef} required value={login.pharmacyCode} onChange={(event) => setLogin({ ...login, pharmacyCode: event.target.value })} />
                  </span>
                </label>
                <label>
                  Employee Number
                  <span className="workspace-input-shell">
                    <span aria-hidden="true">👤</span>
                    <input required value={login.employeeNumber} onChange={(event) => setLogin({ ...login, employeeNumber: event.target.value })} />
                  </span>
                </label>
                <label>
                  PIN / Password
                  <span className="workspace-input-shell">
                    <span aria-hidden="true">🔒</span>
                    <input required type="password" inputMode="numeric" value={login.pin} onChange={(event) => setLogin({ ...login, pin: event.target.value })} />
                  </span>
                </label>
              </div>
              <footer className="workspace-login-footer">
                <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
              </footer>
            </form>
          ) : (
            <>
              <header className="workspace-header">
                <div>
                  <small>{BRAND_NAME}</small>
                  <strong>{profile?.fullName || profile?.full_name || profile?.employeeNumber || "Staff Member"}</strong>
                  <span>{profile?.pharmacyName || profile?.pharmacy_name || "Pharmacy"} · {ROLE_LABELS[displayRole] || ROLE_LABELS[role] || role.replace(/_/g, " ")}</span>
                </div>
              </header>

              <div className="workspace-body">
                {showAdminSidebar ? (
                  <aside className="workspace-sidebar" aria-label="Manager tools">
                    <button type="button" className={activeSection === "chat" ? "active" : ""} onClick={() => setActiveSection("chat")}>
                      Chat
                    </button>
                    {adminSections.map((section) => (
                      <button key={section} type="button" className={activeSection === section ? "active" : ""} onClick={() => setActiveSection(section)}>
                        {SECTION_LABELS[section]}
                      </button>
                    ))}
                    <button type="button" className={activeSection === "account" ? "active" : ""} onClick={() => setActiveSection("account")}>
                      Account / Settings
                    </button>
                  </aside>
                ) : null}

                <div className="workspace-content">

              {notice ? <div className="workspace-alert alert-success">{notice}</div> : null}
              {error ? <div className="workspace-alert alert-error">{error}</div> : null}

              {activeSection === "chat" ? (
                <section className="workspace-chat">
                  <div className="workspace-disclaimer">Clinical decision-support only. Not a replacement for professional judgement.</div>
                  <div className="workspace-clinical-focus">
                    Ask a clinical medicine question. Axian answers only from approved sources and includes citations.
                  </div>
                  <div className="workspace-messages">
                    {messages.map((message, index) => (
                      <article key={`${message.role}-${index}`} className={`workspace-message message-${message.role}`}>
                        {message.safety ? <div className={`workspace-safety safety-${safetyTone(message)}`}>{safetyTone(message) === "green" ? "No Issue Detected" : message.safety.warning || "PHARMACIST REVIEW REQUIRED"}</div> : null}
                        <p className="workspace-answer">{message.content}</p>
                        {message.explanation ? <p className="workspace-explanation">{message.explanation}</p> : null}
                        {message.confidence ? <span className="workspace-confidence">Confidence: {message.confidence}</span> : null}
                        {message.citations?.length ? (
                          <details className="workspace-citations">
                            <summary>Sources</summary>
                            {message.citations.map((citation, citationIndex) => (
                              <div className="workspace-citation" key={`${citation.sourceName || "source"}-${citationIndex}`}>
                                <strong>{citation.sourceName || citation.source_name || citation.documentTitle || "Source document"}</strong>
                                <span>Authority: {citation.authority || citation.sourceOrganization || citation.source_organization || "Approved source"}</span>
                                <span>Version: {citation.sourceVersion || citation.source_version || citation.version || "n/a"}</span>
                                <span>Publication: {citation.publicationDate || citation.publication_date || "n/a"}</span>
                                <span>{citation.section || citation.sourceSection || citation.page || citation.sourceUrl || citation.source_url || "Reference available"}</span>
                              </div>
                            ))}
                          </details>
                        ) : null}
                        {message.reviewNotes ? <span className="workspace-review-notes">Review notes: {message.reviewNotes}</span> : null}
                      </article>
                    ))}
                  </div>
                  <form className="workspace-input" onSubmit={sendQuestion}>
                    <textarea
                      ref={messageInputRef}
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Ask Axian anything..."
                    />
                    <button type="submit" disabled={busy || !question.trim()}>{busy ? "Checking..." : "Send"}</button>
                  </form>
                </section>
              ) : null}

              {activeSection === "account" ? (
                <section className="workspace-account">
                  <h2>Account / Settings</h2>
                  <dl>
                    <dt>Name</dt>
                    <dd>{profile?.fullName || profile?.full_name || "-"}</dd>
                    <dt>Role</dt>
                    <dd>{ROLE_LABELS[displayRole] || ROLE_LABELS[role] || role.replace(/_/g, " ")}</dd>
                    <dt>Employee Number</dt>
                    <dd>{profile?.employeeNumber || profile?.employee_number || "-"}</dd>
                  </dl>
                  <form onSubmit={changePin}>
                    <label>
                      Current PIN
                      <input type="password" inputMode="numeric" maxLength="6" value={accountPin.currentPin} onChange={(event) => setAccountPin({ ...accountPin, currentPin: event.target.value })} />
                    </label>
                    <label>
                      New PIN
                      <input type="password" inputMode="numeric" maxLength="6" value={accountPin.newPin} onChange={(event) => setAccountPin({ ...accountPin, newPin: event.target.value })} />
                    </label>
                    <button type="submit" disabled={busy}>Change PIN</button>
                  </form>
                  <button type="button" className="workspace-logout" onClick={logout}>Logout</button>
                </section>
              ) : null}

              {!["chat", "account"].includes(activeSection) ? (
                <section className="workspace-admin-panel">
                  <h2>{SECTION_LABELS[activeSection]}</h2>
                  <p>This manager tool is available only for authenticated roles with backend permission. Normal staff cannot access it from this workspace.</p>
                  <div className="workspace-admin-grid">
                    <a href={`/${activeSection}`}>Open full workspace</a>
                    <span>Role: {role.replace(/_/g, " ")}</span>
                  </div>
                </section>
              ) : null}
                </div>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
