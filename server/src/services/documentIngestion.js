import pdfParse from "pdf-parse";
import dns from "node:dns/promises";
import net from "node:net";
import { pool, query } from "../db/pool.js";
import { config } from "../config.js";
import { audit } from "./audit.js";
import { chunkText } from "./chunker.js";
import { embedText } from "./ollama.js";

export async function extractUploadText(file) {
  if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
    const parsed = await pdfParse(file.buffer);
    return parsed.text;
  }

  return file.buffer.toString("utf8");
}

export function isRecognisedMedicalUrl(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return config.approvedSourceDomains.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

export async function getApprovedSourceDomains() {
  const result = await query("SELECT value FROM ingestion_settings WHERE key = 'approved_source_domains'");
  if (result.rowCount === 0 || !Array.isArray(result.rows[0].value)) {
    return config.approvedSourceDomains;
  }

  return result.rows[0].value.map((domain) => String(domain).trim().toLowerCase()).filter(Boolean);
}

export async function isRecognisedMedicalUrlFromSettings(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const approvedDomains = await getApprovedSourceDomains();
    return approvedDomains.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function isPrivateAddress(address) {
  if (net.isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }

  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
  }

  return true;
}

async function assertSafeFetchUrl(sourceUrl) {
  const parsed = new URL(sourceUrl);
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }

  const records = await dns.lookup(parsed.hostname, { all: true });
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("URL resolves to a private or unsafe network address.");
  }
}

export async function fetchUrlText(sourceUrl) {
  await assertSafeFetchUrl(sourceUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.urlFetchTimeoutMs);
  try {
    const response = await fetch(sourceUrl, {
      redirect: "error",
      signal: controller.signal,
      headers: {
        "User-Agent": "SA-MedAssist-Pilot/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`Could not fetch URL: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > config.maxUrlBytes) {
      throw new Error(`URL content exceeds the ${config.maxUrlBytes} byte ingestion limit.`);
    }

    const chunks = [];
    let totalBytes = 0;
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("URL response body could not be streamed.");
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > config.maxUrlBytes) {
        await reader.cancel();
        throw new Error(`URL content exceeds the ${config.maxUrlBytes} byte ingestion limit.`);
      }
      chunks.push(Buffer.from(value));
    }

    const buffer = Buffer.concat(chunks);
    if (contentType.includes("application/pdf") || sourceUrl.toLowerCase().endsWith(".pdf")) {
      const parsed = await pdfParse(buffer);
      return parsed.text;
    }

    const html = buffer.toString("utf8");
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  } finally {
    clearTimeout(timeout);
  }
}

export async function indexApprovedDocument(documentId, actor = "admin") {
  const documentResult = await query(
    "SELECT id, source_id, version, title, raw_text, status, expiry_date FROM documents WHERE id = $1",
    [documentId]
  );

  if (documentResult.rowCount === 0) {
    throw new Error("Document not found.");
  }

  const document = documentResult.rows[0];
  if (document.status === "rejected" || document.status === "archived" || document.status === "superseded") {
    throw new Error("Rejected, archived, or superseded documents cannot be indexed.");
  }

  if (document.status !== "pending" && document.status !== "approved") {
    throw new Error("Only pending or approved documents can enter approval indexing.");
  }

  if (document.expiry_date && new Date(document.expiry_date) <= new Date()) {
    throw new Error("Expired sources cannot be approved or indexed.");
  }

  const chunks = chunkText(document.raw_text);
  if (chunks.length === 0) {
    throw new Error("No readable text found for indexing.");
  }

  const latestVersion = await query(
    "SELECT max(version)::int AS version FROM documents WHERE source_id = $1",
    [document.source_id]
  );
  if (latestVersion.rows[0].version !== document.version) {
    throw new Error("Only the latest submitted version of a source can be approved and indexed.");
  }

  const embeddedChunks = [];
  for (let index = 0; index < chunks.length; index += 1) {
    embeddedChunks.push({
      index,
      content: chunks[index],
      embedding: await embedText(chunks[index])
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE documents
       SET status = 'superseded',
           active_flag = false,
           replaced_by_document_id = $1,
           replaced_at = now()
       WHERE source_id = $2
         AND id <> $1
         AND status = 'approved'
         AND active_flag = true`,
      [documentId, document.source_id]
    );
    await client.query(
      `DELETE FROM document_chunks
       WHERE document_id IN (
         SELECT id FROM documents
         WHERE source_id = $1
           AND id <> $2
           AND (status <> 'approved' OR active_flag = false)
       )`,
      [document.source_id, documentId]
    );
    await client.query("DELETE FROM document_chunks WHERE document_id = $1", [documentId]);
    for (const chunk of embeddedChunks) {
      await client.query(
        `INSERT INTO document_chunks (document_id, chunk_index, content, citation_label, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [documentId, chunk.index, chunk.content, `${document.title}, chunk ${chunk.index + 1}`, `[${chunk.embedding.join(",")}]`]
      );
    }

    await client.query(
      `UPDATE documents
       SET status = 'approved',
           active_flag = true,
           approved_by = $2,
           approved_at = now(),
           approver = $2,
           approval_date = now(),
           rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
       WHERE id = $1`,
      [documentId, actor]
    );
    await client.query("COMMIT");

    await audit("admin.document_approved", {
      actor,
      metadata: { documentId, sourceId: document.source_id, version: document.version, chunks: chunks.length }
    });

    return { chunks: chunks.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectDocument(documentId, reason, actor = "admin") {
  await query("DELETE FROM document_chunks WHERE document_id = $1", [documentId]);
  const result = await query(
    `UPDATE documents
     SET status = 'rejected', active_flag = false, rejected_by = $2, rejected_at = now(), rejection_reason = $3
     WHERE id = $1
     RETURNING id, source_id, version`,
    [documentId, actor, reason || "Rejected by admin"]
  );

  if (result.rowCount === 0) {
    throw new Error("Document not found.");
  }

  await audit("admin.document_rejected", {
    actor,
    metadata: { documentId, sourceId: result.rows[0].source_id, version: result.rows[0].version, reason: reason || "Rejected by admin" }
  });
}
