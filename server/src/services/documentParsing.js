import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import xlsx from "xlsx";

function rowsToText(rows) {
  return rows.map((row) => row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" | ")).join("\n");
}

export async function parseDocumentFile(file) {
  const name = file.originalname.toLowerCase();
  const mime = file.mimetype;

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    const parsed = await pdfParse(file.buffer);
    return {
      parser: "pdf-parse",
      text: parsed.text,
      pages: [{ pageNumber: 1, sectionHeading: "PDF content", text: parsed.text }]
    };
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    return {
      parser: "mammoth",
      text: parsed.value,
      pages: [{ pageNumber: 1, sectionHeading: "DOCX content", text: parsed.value }]
    };
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    name.endsWith(".xlsx") ||
    name.endsWith(".csv")
  ) {
    const workbook = xlsx.read(file.buffer, { type: "buffer" });
    const pages = workbook.SheetNames.map((sheetName, index) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
      return {
        pageNumber: index + 1,
        sectionHeading: sheetName,
        text: rowsToText(rows)
      };
    });
    return {
      parser: name.endsWith(".csv") ? "xlsx-csv" : "xlsx",
      text: pages.map((page) => `${page.sectionHeading}\n${page.text}`).join("\n\n"),
      pages
    };
  }

  return {
    parser: "plain-text",
    text: file.buffer.toString("utf8"),
    pages: [{ pageNumber: 1, sectionHeading: "Text content", text: file.buffer.toString("utf8") }]
  };
}
