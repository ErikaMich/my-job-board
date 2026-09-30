// lib/server.js
// Serves the report so its "Custom CV" button has something to call — a
// plain HTML file has no backend to fetch() against. Stays running after
// `npm start` finishes fetching listings; stop it with Ctrl+C.

import http from "node:http";
import { execFile } from "node:child_process";
import { renderReport } from "./report.js";
import { getAllRows } from "./sheet.js";
import { customizeCvForRow } from "./cvCustomizer.js";
import { CV_SERVER_PORT } from "../config.js";

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleCustomizeCv(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;

  let link;
  try {
    ({ link } = JSON.parse(body));
  } catch {
    return sendJson(res, 400, { ok: false, error: "Invalid request body." });
  }

  try {
    const rows = await getAllRows();
    const row = rows.find((r) => r["Link to Job Post"] === link);
    if (!row) throw new Error("Couldn't find that listing in the spreadsheet.");
    const { docxPath, pdfPath } = await customizeCvForRow(row);
    const openPath = pdfPath || docxPath;
    execFile("open", [openPath], (err) => {
      if (err) console.warn("Couldn't open the tailored CV automatically:", err.message);
    });
    sendJson(res, 200, { ok: true, docxPath, pdfPath });
  } catch (err) {
    console.warn("Custom CV failed:", err.message);
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

export function startServer(port = CV_SERVER_PORT) {
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
      const rows = await getAllRows();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderReport(rows));
      return;
    }
    if (req.method === "POST" && req.url === "/customize-cv") {
      return handleCustomizeCv(req, res);
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      // Most likely a server from an earlier `npm start` still running in
      // another terminal tab. It serves the sheet fresh on every request,
      // so today's new listings will show up there too — nothing lost,
      // just reuse it instead of crashing the whole run over a taken port.
      console.log(
        `A report server is already running on port ${port} — reusing it instead (it'll show today's new listings too).`
      );
      return;
    }
    console.warn("Report server error:", err.message);
  });

  server.listen(port, () => {
    console.log(`Report running at http://localhost:${port} — press Ctrl+C to stop.`);
  });
  return server;
}
