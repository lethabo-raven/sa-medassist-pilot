(function () {
  var currentScript = document.currentScript;
  var globalConfig = window.SAMedAssistWidget || {};
  var apiBase =
    globalConfig.apiBase ||
    (currentScript && currentScript.getAttribute("data-api-base")) ||
    new URL("/api", currentScript ? currentScript.src : window.location.href).toString().replace(/\/$/, "");
  var brandName =
    globalConfig.brandName ||
    (currentScript && currentScript.getAttribute("data-brand-name")) ||
    "Medical assistant";
  var primaryColor =
    globalConfig.primaryColor ||
    (currentScript && currentScript.getAttribute("data-primary-color")) ||
    "#23715f";
  var accentColor =
    globalConfig.accentColor ||
    (currentScript && currentScript.getAttribute("data-accent-color")) ||
    "#18212f";

  if (document.getElementById("sa-medassist-widget-root")) return;

  var root = document.createElement("div");
  root.id = "sa-medassist-widget-root";
  document.body.appendChild(root);

  var style = document.createElement("style");
  style.textContent = [
    "#sa-medassist-widget-root{font-family:Inter,Arial,sans-serif;position:fixed;z-index:2147483647;right:18px;bottom:18px;color:#18212f}",
    "#sa-medassist-widget-root *{box-sizing:border-box}",
    ".sam-launch{width:58px;height:58px;border:0;border-radius:999px;background:" + primaryColor + ";color:#fff;box-shadow:0 16px 42px rgba(24,33,47,.25);cursor:pointer;font-size:25px}",
    ".sam-panel{width:min(410px,calc(100vw - 28px));height:min(620px,calc(100vh - 28px));background:#fff;border:1px solid #dce5ee;border-radius:8px;box-shadow:0 22px 56px rgba(24,33,47,.28);overflow:hidden;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto}",
    ".sam-head{background:" + accentColor + ";color:#fff;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px}",
    ".sam-head strong{display:block;font-size:15px}.sam-head span{display:block;color:#c5d1dd;font-size:12px;margin-top:2px}.sam-close{border:0;background:transparent;color:#fff;font-size:22px;cursor:pointer}",
    ".sam-disclaimer{background:#fff7e6;border-bottom:1px solid #f2d38c;color:#5b4314;font-size:12px;line-height:1.35;padding:10px 12px;font-weight:700}",
    ".sam-messages{background:#f7f9fc;padding:12px;display:grid;gap:10px;overflow:auto}",
    ".sam-msg{max-width:88%;border-radius:8px;padding:10px 11px;font-size:14px;line-height:1.42}.sam-user{justify-self:end;background:" + primaryColor + ";color:#fff}.sam-bot{justify-self:start;background:#fff;border:1px solid #e1e8ef}",
    ".sam-cites{display:grid;gap:4px;margin-top:8px}.sam-cites span{color:#5c6876;font-size:11px}",
    ".sam-form{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:8px;padding:11px;border-top:1px solid #dce5ee;background:#fff}.sam-form input{border:1px solid #ccd7e2;border-radius:6px;padding:11px;font:inherit;min-width:0}.sam-form button{border:0;border-radius:6px;background:" + primaryColor + ";color:#fff;font-size:18px;cursor:pointer}",
    "@media(max-width:520px){#sa-medassist-widget-root{right:10px;bottom:10px}.sam-panel{width:calc(100vw - 20px);height:calc(100vh - 20px)}}"
  ].join("");
  document.head.appendChild(style);

  var open = false;
  var selectedRole = sessionStorage.getItem("saMedAssistRole") || "";
  var roles = ["Pharmacist", "Pharmacist Assistant", "Pharmacy Manager", "Doctor", "Other"];
  var messages = [
    {
      role: "bot",
      text: "Select your role, then ask a medical-information question. If no role is selected, Pharmacy Assistant safety mode applies.",
      citations: []
    }
  ];

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char];
    });
  }

  function render() {
    if (!open) {
      root.innerHTML = '<button class="sam-launch" aria-label="Open medical assistant">+</button>';
      root.querySelector("button").onclick = function () {
        open = true;
        render();
      };
      return;
    }

    root.innerHTML =
      '<section class="sam-panel" role="dialog" aria-label="' + esc(brandName) + '">' +
      '<header class="sam-head"><div><strong>' + esc(brandName) + '</strong><span>Citation-only mode</span></div><button class="sam-close" aria-label="Close">×</button></header>' +
      '<div class="sam-disclaimer">Clinical decision-support only. Not a replacement for professional judgement.</div>' +
      '<div class="sam-disclaimer"><label>Role <select class="sam-role"><option value="">Pharmacy Assistant safety mode</option>' +
      roles.map(function (role) {
        return '<option value="' + esc(role) + '"' + (selectedRole === role ? " selected" : "") + ">" + esc(role) + "</option>";
      }).join("") +
      '</select></label></div>' +
      '<div class="sam-messages">' +
      messages.map(function (message) {
        var cites = "";
        if (message.citations && message.citations.length) {
          cites = '<div class="sam-cites">' + message.citations.map(function (citation) {
            return "<span>[" + esc(citation.index) + "] " + esc(citation.title || citation.label || "Source") + "</span>";
          }).join("") + "</div>";
        }
        return '<article class="sam-msg sam-' + message.role + '"><div>' + esc(message.text) + "</div>" + cites + "</article>";
      }).join("") +
      '</div><form class="sam-form"><input maxlength="1200" placeholder="Ask from approved sources" /><button aria-label="Send">›</button></form></section>';

    root.querySelector(".sam-close").onclick = function () {
      open = false;
      render();
    };
    root.querySelector(".sam-role").onchange = function (event) {
      selectedRole = event.target.value;
      if (selectedRole) {
        sessionStorage.setItem("saMedAssistRole", selectedRole);
        messages.push({ role: "bot", text: "Role selected: " + selectedRole + ".", citations: [] });
      } else {
        sessionStorage.removeItem("saMedAssistRole");
        messages.push({ role: "bot", text: "No role selected. Pharmacy Assistant safety mode applies.", citations: [] });
      }
      render();
    };
    var form = root.querySelector("form");
    var input = root.querySelector("input");
    form.onsubmit = function (event) {
      event.preventDefault();
      var question = input.value.trim();
      if (!question) return;
      messages.push({ role: "user", text: question, citations: [] });
      messages.push({ role: "bot", text: "Checking approved sources...", citations: [] });
      render();
      fetch(apiBase + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, actor: "embedded-widget", role: selectedRole || undefined })
      })
        .then(function (response) { return response.json(); })
        .then(function (body) {
          messages.pop();
          messages.push({ role: "bot", text: body.answer || body.error || "I could not answer that.", citations: body.citations || [] });
          render();
        })
        .catch(function () {
          messages.pop();
          messages.push({ role: "bot", text: "The assistant is unavailable right now.", citations: [] });
          render();
        });
    };
    root.querySelector(".sam-messages").scrollTop = root.querySelector(".sam-messages").scrollHeight;
  }

  render();
})();
