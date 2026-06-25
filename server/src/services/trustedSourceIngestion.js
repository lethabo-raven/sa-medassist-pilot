import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import * as db from "../db/pool.js";
import { assertVectorOptional } from "./vectorCompatibility.js";

const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".csv"]);
const MAX_DOWNLOAD_BYTES = Number(process.env.TRUSTED_SOURCE_MAX_DOWNLOAD_BYTES || 50 * 1024 * 1024);
const STORAGE_ROOT = path.resolve(process.env.TRUSTED_SOURCE_STORAGE_DIR || path.join(process.cwd(), "storage", "trusted-sources"));

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function safeSegment(value) {
  return String(value || "source").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "source";
}

function sourceFilter(value) {
  return String(value || "").trim().toUpperCase();
}

function absoluteUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extensionFromUrl(url) {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(extension) ? extension : "";
}

function documentTypeFromExtension(extension) {
  return extension.replace(".", "").toUpperCase();
}

function titleFromUrl(url) {
  const filename = decodeURIComponent(path.basename(new URL(url).pathname));
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Trusted source document";
}

function allowedByDomain(url, allowedDomains) {
  const host = new URL(url).hostname.toLowerCase();
  return (allowedDomains || []).some((domain) => {
    const normalized = String(domain || "").toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "AxianTrustedSourceIngestion/1.0" },
  });
  if (!response.ok) {
    throw new Error(`source_fetch_failed:${response.status}:${response.statusText}`);
  }
  return response.text();
}

export function discoverDocumentLinks(html, baseUrl, allowedDomains) {
  const links = new Map();
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = hrefPattern.exec(html))) {
    const fileUrl = absoluteUrl(baseUrl, match[1]);
    if (!fileUrl) continue;
    if (!allowedByDomain(fileUrl, allowedDomains)) continue;
    const extension = extensionFromUrl(fileUrl);
    if (!extension) continue;
    links.set(fileUrl, {
      fileUrl,
      title: titleFromUrl(fileUrl),
      documentType: documentTypeFromExtension(extension),
      extension,
    });
  }
  return [...links.values()];
}

async function downloadWithChecksum(fileUrl, localFilePath) {
  const response = await fetch(fileUrl, {
    headers: { "User-Agent": "AxianTrustedSourceIngestion/1.0" },
  });
  if (!response.ok) {
    throw new Error(`download_failed:${response.status}:${response.statusText}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`download_too_large:${contentLength}`);
  }

  await fs.promises.mkdir(path.dirname(localFilePath), { recursive: true });
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  const hashingStream = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_DOWNLOAD_BYTES) {
        callback(new Error(`download_too_large:${bytes}`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  await pipeline(Readable.fromWeb(response.body), hashingStream, fs.createWriteStream(localFilePath));
  return { checksum: hash.digest("hex"), bytes };
}

function stripPdfText(buffer) {
  const raw = buffer.toString("latin1");
  const textObjects = [];
  const textPattern = /\(([^()]|\\[()\\nrtbf])*\)\s*Tj/g;
  let match;
  while ((match = textPattern.exec(raw))) {
    textObjects.push(match[0].replace(/\)\s*Tj$/, "").replace(/^\(/, ""));
  }
  const fallback = raw.replace(/[^\x20-\x7E\n\r\t]+/g, " ");
  return (textObjects.join(" ") || fallback).replace(/\s+/g, " ").trim();
}

function extractTextFromXlsxLike(buffer) {
  return buffer.toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function extractText(localFilePath, documentType) {
  const buffer = await fs.promises.readFile(localFilePath);
  if (documentType === "CSV") return buffer.toString("utf8");
  if (documentType === "PDF") return stripPdfText(buffer);
  if (documentType === "DOCX" || documentType === "XLSX") return extractTextFromXlsxLike(buffer);
  return buffer.toString("utf8");
}

export function chunkText(text, chunkSize = 1800, overlap = 180) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const end = Math.min(cursor + chunkSize, normalized.length);
    chunks.push(normalized.slice(cursor, end).trim());
    if (end === normalized.length) break;
    cursor = Math.max(0, end - overlap);
  }
  return chunks;
}

async function getExistingDownloadedDocument(sourceId, fileUrl) {
  const { rows } = await query(
    `
    SELECT *
    FROM trusted_source_documents
    WHERE source_id = $1
      AND file_url = $2
      AND download_status = 'downloaded'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [sourceId, fileUrl],
  );
  return rows[0] || null;
}

async function findPreviousActiveDocument(sourceId, fileUrl) {
  const { rows } = await query(
    `
    SELECT *
    FROM trusted_source_documents
    WHERE source_id = $1
      AND file_url = $2
      AND approval_status = 'approved'
      AND active = true
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [sourceId, fileUrl],
  );
  return rows[0] || null;
}

async function insertFailedDocument({ source, discovered, error }) {
  await query(
    `
    INSERT INTO trusted_source_documents (
      source_id, title, source_url, file_url, document_type, authority,
      download_status, ingestion_status, approval_status, active
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'failed', 'download_failed', 'pending_review', false)
    ON CONFLICT DO NOTHING
    `,
    [source.source_id, discovered.title, source.base_url, discovered.fileUrl, discovered.documentType, source.authority || source.source_name],
  );
  console.error(`trusted_source_download_failed source=${source.source_id} url=${discovered.fileUrl} error=${error.message}`);
}

async function insertTrustedDocument({ source, discovered, checksum, localFilePath, previousDocument }) {
  const version = `${todayIso()}-${checksum.slice(0, 12)}`;
  const { rows } = await query(
    `
    INSERT INTO trusted_source_documents (
      source_id, pharmacy_id, title, source_url, file_url, local_file_path, file_path,
      document_type, authority, version, checksum, download_status, ingestion_status,
      approval_status, active, previous_document_id
    )
    VALUES ($1, NULL, $2, $3, $4, $5, $5, $6, $7, $8, $9, 'downloaded', 'downloaded', 'pending_review', false, $10)
    ON CONFLICT DO NOTHING
    RETURNING *
    `,
    [
      source.source_id,
      discovered.title,
      source.base_url,
      discovered.fileUrl,
      localFilePath,
      discovered.documentType,
      source.authority || source.source_name,
      version,
      checksum,
      previousDocument?.document_id || null,
    ],
  );
  if (rows[0]) return rows[0];
  const existing = await query(
    `
    SELECT *
    FROM trusted_source_documents
    WHERE source_id = $1
      AND file_url = $2
      AND checksum = $3
    LIMIT 1
    `,
    [source.source_id, discovered.fileUrl, checksum],
  );
  return existing.rows[0];
}

async function createRepositoryDocument({ source, trustedDocument }) {
  await query(
    `
    INSERT INTO documents (
      trusted_source_document_id, pharmacy_id, title, document_category, source_organization,
      source_type, source_url, authority, version, file_name, processing_status,
      approval_status, active_flag, uploader
    )
    VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_review', 'pending_review', false, 'trusted_source_ingestion')
    ON CONFLICT DO NOTHING
    `,
    [
      trustedDocument.document_id,
      trustedDocument.title,
      source.document_category,
      source.source_name,
      source.source_type,
      trustedDocument.file_url,
      trustedDocument.authority,
      trustedDocument.version,
      path.basename(trustedDocument.local_file_path || trustedDocument.file_path || "trusted-source-document"),
    ],
  );
}

async function storeChunks({ trustedDocument, text }) {
  const chunks = chunkText(text);
  await query("DELETE FROM trusted_document_chunks WHERE document_id = $1", [trustedDocument.document_id]);
  for (let index = 0; index < chunks.length; index += 1) {
    await query(
      `
      INSERT INTO trusted_document_chunks (
        document_id, chunk_index, chunk_text, page_number, source_url, authority, version, publication_date
      )
      VALUES ($1, $2, $3, NULL, $4, $5, $6, $7)
      `,
      [
        trustedDocument.document_id,
        index,
        chunks[index],
        trustedDocument.file_url,
        trustedDocument.authority,
        trustedDocument.version,
        trustedDocument.publication_date || null,
      ],
    );
  }
  return chunks.length;
}

async function extractAndChunk(trustedDocument) {
  try {
    const text = await extractText(trustedDocument.local_file_path || trustedDocument.file_path, trustedDocument.document_type);
    if (!text.trim()) {
      throw new Error("empty_extracted_text");
    }
    const chunkCount = await storeChunks({ trustedDocument, text });
    await query(
      `
      UPDATE trusted_source_documents
      SET ingestion_status = 'pending_review',
          updated_at = now()
      WHERE document_id = $1
      `,
      [trustedDocument.document_id],
    );
    return { extractionStatus: "ok", chunkCount };
  } catch (error) {
    await query(
      `
      UPDATE trusted_source_documents
      SET ingestion_status = 'extraction_failed',
          updated_at = now()
      WHERE document_id = $1
      `,
      [trustedDocument.document_id],
    );
    return { extractionStatus: "failed", chunkCount: 0, error: error.message };
  }
}

export async function getTrustedSources(sourceId) {
  const normalized = sourceFilter(sourceId);
  const params = [];
  let where = "WHERE enabled = true";
  if (normalized) {
    params.push(normalized);
    where += " AND source_id = $1";
  }
  const { rows } = await query(
    `
    SELECT *
    FROM trusted_sources
    ${where}
    ORDER BY source_id
    `,
    params,
  );
  return rows;
}

export async function ingestTrustedSources({ source } = {}) {
  if (!query) throw new Error("database_query_helper_unavailable");
  const sources = await getTrustedSources(source);
  const summary = {
    ...assertVectorOptional(),
    sourcesChecked: 0,
    discovered: 0,
    downloaded: 0,
    skipped: 0,
    changed: 0,
    failed: 0,
    extracted: 0,
    chunksStored: 0,
    results: [],
  };

  for (const sourceRecord of sources) {
    const result = {
      sourceId: sourceRecord.source_id,
      scanned: false,
      discovered: 0,
      downloaded: 0,
      skipped: 0,
      changed: 0,
      failed: 0,
      extracted: 0,
      chunksStored: 0,
      unavailable: false,
      events: [],
    };
    summary.sourcesChecked += 1;

    try {
      const html = await fetchHtml(sourceRecord.base_url);
      result.scanned = true;
      const discoveredLinks = discoverDocumentLinks(html, sourceRecord.base_url, sourceRecord.allowed_domains || []);
      result.discovered = discoveredLinks.length;
      summary.discovered += discoveredLinks.length;

      if (discoveredLinks.length === 0) result.unavailable = true;

      for (const discovered of discoveredLinks) {
        const folder = path.join(STORAGE_ROOT, safeSegment(sourceRecord.source_name), todayIso());
        const filename = `${crypto.createHash("sha1").update(discovered.fileUrl).digest("hex")}${discovered.extension}`;
        const localFilePath = path.join(folder, filename);

        try {
          const previousDownloaded = await getExistingDownloadedDocument(sourceRecord.source_id, discovered.fileUrl);
          const { checksum } = await downloadWithChecksum(discovered.fileUrl, localFilePath);
          if (previousDownloaded?.checksum === checksum) {
            result.skipped += 1;
            summary.skipped += 1;
            result.events.push({ type: "duplicate", fileUrl: discovered.fileUrl });
            continue;
          }

          const previousActive = await findPreviousActiveDocument(sourceRecord.source_id, discovered.fileUrl);
          const trustedDocument = await insertTrustedDocument({
            source: sourceRecord,
            discovered,
            checksum,
            localFilePath,
            previousDocument: previousActive,
          });
          await createRepositoryDocument({ source: sourceRecord, trustedDocument });
          const extraction = await extractAndChunk(trustedDocument);

          result.downloaded += 1;
          summary.downloaded += 1;
          if (previousDownloaded && previousDownloaded.checksum !== checksum) {
            result.changed += 1;
            summary.changed += 1;
          }
          if (extraction.extractionStatus === "ok") {
            result.extracted += 1;
            summary.extracted += 1;
            result.chunksStored += extraction.chunkCount;
            summary.chunksStored += extraction.chunkCount;
          } else {
            result.failed += 1;
            summary.failed += 1;
          }
          result.events.push({
            type: previousDownloaded ? "changed" : "downloaded",
            fileUrl: discovered.fileUrl,
            checksum,
            extractionStatus: extraction.extractionStatus,
            chunkCount: extraction.chunkCount,
          });
        } catch (error) {
          result.failed += 1;
          summary.failed += 1;
          await insertFailedDocument({ source: sourceRecord, discovered, error });
          result.events.push({ type: "failed", fileUrl: discovered.fileUrl, error: error.message });
        }
      }
    } catch (error) {
      result.failed += 1;
      summary.failed += 1;
      result.events.push({ type: "source_failed", error: error.message });
    } finally {
      await query("UPDATE trusted_sources SET last_checked_at = now(), updated_at = now() WHERE source_id = $1", [sourceRecord.source_id]);
    }

    summary.results.push(result);
  }

  return summary;
}

export async function runTrustedSourceCheck(options = {}) {
  return ingestTrustedSources(options);
}

export async function approveTrustedSourceDocument({ documentId, reviewer = "system" }) {
  const { rows } = await query(
    `
    UPDATE trusted_source_documents
    SET approval_status = 'approved',
        active = true,
        ingestion_status = CASE
          WHEN ingestion_status = 'extraction_failed' THEN ingestion_status
          ELSE 'approved'
        END,
        updated_at = now()
    WHERE document_id = $1
    RETURNING *
    `,
    [documentId],
  );
  const approved = rows[0];
  if (!approved) return null;

  if (approved.previous_document_id) {
    await query(
      `
      UPDATE trusted_source_documents
      SET active = false,
          approval_status = CASE WHEN approval_status = 'approved' THEN 'superseded' ELSE approval_status END,
          updated_at = now()
      WHERE document_id = $1
      `,
      [approved.previous_document_id],
    );
  }

  await query(
    `
    UPDATE documents
    SET approval_status = 'approved',
        active_flag = true,
        processing_status = 'approved',
        reviewer = $2,
        approval_date = now(),
        updated_at = now()
    WHERE trusted_source_document_id = $1
    `,
    [documentId, reviewer],
  );

  return approved;
}
