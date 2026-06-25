import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import * as db from "../db/pool.js";

const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".csv"]);
const DEFAULT_STORAGE_DIR = path.resolve(process.cwd(), "storage", "trusted-sources");
const MAX_DOWNLOAD_BYTES = Number(process.env.TRUSTED_SOURCE_MAX_DOWNLOAD_BYTES || 50 * 1024 * 1024);

function normalizeSourceFilter(value) {
  return String(value || "").trim().toUpperCase();
}

function extensionFromUrl(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  return SUPPORTED_EXTENSIONS.has(path.extname(pathname)) ? path.extname(pathname) : "";
}

function isAllowedDomain(url, allowedDomains) {
  const host = new URL(url).hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const normalized = String(domain).toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

function absoluteUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function titleFromUrl(url) {
  const pathname = new URL(url).pathname;
  const filename = decodeURIComponent(path.basename(pathname));
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Trusted source document";
}

function documentTypeFromExtension(extension) {
  return extension.replace(".", "").toUpperCase();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "AxianTrustedSourceIngestion/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Source fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function discoverDocumentLinks(html, baseUrl, allowedDomains) {
  const links = new Map();
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = hrefPattern.exec(html))) {
    const url = absoluteUrl(baseUrl, match[1]);
    if (!url) continue;
    if (!isAllowedDomain(url, allowedDomains)) continue;
    const extension = extensionFromUrl(url);
    if (!extension) continue;
    links.set(url, {
      fileUrl: url,
      title: titleFromUrl(url),
      documentType: documentTypeFromExtension(extension),
    });
  }
  return [...links.values()];
}

async function downloadFile(fileUrl, targetPath) {
  const response = await fetch(fileUrl, {
    headers: {
      "User-Agent": "AxianTrustedSourceIngestion/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Download rejected: file exceeds ${MAX_DOWNLOAD_BYTES} bytes`);
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

  const hash = crypto.createHash("sha256");
  let bytes = 0;
  const source = Readable.fromWeb(response.body);
  const hashingStream = new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_DOWNLOAD_BYTES) {
        throw new Error(`Download rejected: file exceeds ${MAX_DOWNLOAD_BYTES} bytes`);
      }
      hash.update(chunk);
      controller.enqueue(chunk);
    },
  });

  await pipeline(Readable.fromWeb(response.body.pipeThrough(hashingStream)), fs.createWriteStream(targetPath));
  return {
    checksum: hash.digest("hex"),
    bytes,
  };
}

async function recordDownloadFailure({ source, discoveredDocument, error }) {
  await query(
    `
    INSERT INTO trusted_source_documents (
      source_id,
      title,
      source_url,
      file_url,
      document_type,
      authority,
      download_status,
      ingestion_status,
      approval_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'failed', 'failed', 'pending')
    ON CONFLICT DO NOTHING
    `,
    [
      source.source_id,
      discoveredDocument.title,
      source.base_url,
      discoveredDocument.fileUrl,
      discoveredDocument.documentType,
      source.source_name,
    ],
  );
  console.error(`Trusted source download failed for ${discoveredDocument.fileUrl}: ${error.message}`);
}

async function createPendingDocument({ source, discoveredDocument, filePath, checksum }) {
  const { rows: trustedRows } = await query(
    `
    INSERT INTO trusted_source_documents (
      source_id,
      pharmacy_id,
      title,
      source_url,
      file_url,
      document_type,
      authority,
      checksum,
      file_path,
      download_status,
      ingestion_status,
      approval_status
    )
    VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, 'downloaded', 'pending_review', 'pending')
    ON CONFLICT DO NOTHING
    RETURNING *
    `,
    [
      source.source_id,
      discoveredDocument.title,
      source.base_url,
      discoveredDocument.fileUrl,
      discoveredDocument.documentType,
      source.source_name,
      checksum,
      filePath,
    ],
  );

  const trustedDocument = trustedRows[0] || (await query(
    `
    SELECT *
    FROM trusted_source_documents
    WHERE source_id = $1
      AND file_url = $2
      AND COALESCE(checksum, '') = COALESCE($3, '')
    LIMIT 1
    `,
    [source.source_id, discoveredDocument.fileUrl, checksum],
  )).rows[0];
  await query(
    `
    INSERT INTO documents (
      trusted_source_document_id,
      pharmacy_id,
      title,
      document_category,
      source_organization,
      source_type,
      source_url,
      authority,
      file_name,
      processing_status,
      approval_status,
      active_flag,
      uploader
    )
    VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, 'uploaded', 'pending', false, 'trusted_source_ingestion')
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
      path.basename(filePath),
    ],
  );

  return trustedDocument;
}

export async function getTrustedSources(sourceFilter) {
  const normalized = normalizeSourceFilter(sourceFilter);
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

export async function ingestTrustedSources({ source: sourceFilter } = {}) {
  const sources = await getTrustedSources(sourceFilter);
  const summary = {
    sourcesChecked: 0,
    discovered: 0,
    downloaded: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  for (const source of sources) {
    summary.sourcesChecked += 1;
    const result = {
      sourceId: source.source_id,
      discovered: 0,
      downloaded: 0,
      skipped: 0,
      failed: 0,
      unavailable: false,
    };

    try {
      const html = await fetchText(source.base_url);
      const links = discoverDocumentLinks(html, source.base_url, source.allowed_domains || []);
      result.discovered = links.length;
      summary.discovered += links.length;

      for (const discoveredDocument of links) {
        const existing = await query(
          `
          SELECT document_id
          FROM trusted_source_documents
          WHERE source_id = $1 AND file_url = $2 AND download_status = 'downloaded'
          LIMIT 1
          `,
          [source.source_id, discoveredDocument.fileUrl],
        );
        if (existing.rows[0]) {
          result.skipped += 1;
          summary.skipped += 1;
          continue;
        }

        const extension = extensionFromUrl(discoveredDocument.fileUrl);
        const safeName = crypto.createHash("sha1").update(discoveredDocument.fileUrl).digest("hex");
        const filePath = path.join(
          process.env.TRUSTED_SOURCE_STORAGE_DIR || DEFAULT_STORAGE_DIR,
          source.source_id,
          `${safeName}${extension}`,
        );

        try {
          const { checksum } = await downloadFile(discoveredDocument.fileUrl, filePath);
          await createPendingDocument({ source, discoveredDocument, filePath, checksum });
          result.downloaded += 1;
          summary.downloaded += 1;
        } catch (error) {
          result.failed += 1;
          summary.failed += 1;
          await recordDownloadFailure({ source, discoveredDocument, error });
        }
      }

      await query("UPDATE trusted_sources SET last_checked_at = now(), updated_at = now() WHERE source_id = $1", [source.source_id]);
      if (links.length === 0) {
        result.unavailable = true;
      }
    } catch (error) {
      result.failed += 1;
      summary.failed += 1;
      result.error = error.message;
      await query("UPDATE trusted_sources SET last_checked_at = now(), updated_at = now() WHERE source_id = $1", [source.source_id]);
    }

    summary.results.push(result);
  }

  return summary;
}
