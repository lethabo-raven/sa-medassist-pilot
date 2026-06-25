import React from "react";
import { createRoot } from "react-dom/client";
import FloatingWorkspace from "./widget/FloatingWorkspace.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FloatingWorkspace />
  </React.StrictMode>,
);
