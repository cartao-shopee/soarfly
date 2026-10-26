require("dotenv").config();

const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(__dirname, "public")));

const gatewayUrl = process.env.DUTTYFY_PIX_URL_ENCRYPTED;
const port = Number(process.env.PORT || 3000);
const databasePath = process.env.DATABASE_PATH || "./data/pix.sqlite";

if (!gatewayUrl || !gatewayUrl.startsWith("https://")) {
  console.error("Configure DUTTYFY_PIX_URL_ENCRYPTED com a URL HTTPS completa no .env.");
  process.exit(1);
}

const absoluteDbPath = path.resolve(databasePath);
fs.mkdirSync(path.dirname(absoluteDbPath), { recursive: true });
const db = new Database(absoluteDbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT PRIMARY KEY,
    amount INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    pix_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertTransaction = db.prepare(`
  INSERT INTO transactions
  (transaction_id, amount, customer_name, customer_email, pix_code, status)
  VALUES (@transactionId, @amount, @customerName, @customerEmail, @pixCode, 'PENDING')
`);
const getTransaction = db.prepare(`
  SELECT transaction_id, amount, customer_name, customer_email, pix_code,
         status, paid_at, created_at
  FROM transactions WHERE transaction_id = ?
`);
const updateCompleted = db.prepare(`
  UPDATE transactions
  SET status = 'COMPLETED', paid_at = ?, updated_at = CURRENT_TIMESTAMP
  WHERE transaction_id = ? AND status != 'COMPLETED'
`);

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function createChargeWithRetry(payload) {
  const delays = [1000, 2000, 4000];
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchWithTimeout(gatewayUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, 15000);

      if (response.status >= 500) {
        lastError = new Error(`Gateway HTTP ${response.status}`);
        if (attempt < 2) {
          await sleep(delays[attempt]);
          continue;
        }
        throw lastError;
      }
      if (!response.ok) {
        const err = new Error(`Gateway HTTP ${response.status}`);
        err.status = response.status;
        throw err;
      }
      return await response.json();
    } catch (err) {
      if (err.status && err.status >= 400 && err.status < 500) throw err;
      lastError = err;
      if (attempt < 2) {
        await sleep(delays[attempt]);
        continue;
      }
    }
  }
  throw lastError || new Error("Falha ao criar cobrança.");
}

// Fixed price: R$ 67,90. Customer data stays on the server.
// For a multi-customer store, replace these env values with authenticated order/session data.
app.post("/api/pix/create", async (req, res) => {
  try {
    const name = String(process.env.PIX_CUSTOMER_NAME || "").trim();
    const document = digitsOnly(process.env.PIX_CUSTOMER_DOCUMENT);
    const email = String(process.env.PIX_CUSTOMER_EMAIL || "").trim();
    const phone = digitsOnly(process.env.PIX_CUSTOMER_PHONE);
    const utm = typeof req.body?.utm === "string" ? req.body.utm : "";

    if (!name || !/^(\d{11}|\d{14})$/.test(document) ||
        !validEmail(email) || !/^(\d{10}|\d{11})$/.test(phone)) {
      return res.status(503).json({
        error: "O checkout precisa ser conectado aos dados do pedido no backend ou configurado com os dados do pagador no .env."
      });
    }

    const amount = 6790;
    const payload = {
      amount,
      customer: { name, document, email, phone },
      item: { title: "Pedido online", price: amount, quantity: 1 },
      paymentMethod: "PIX",
      utm
    };

    const gatewayResponse = await createChargeWithRetry(payload);
    if (!gatewayResponse || !gatewayResponse.transactionId || !gatewayResponse.pixCode) {
      console.error("Resposta inválida da Duttyfy. URL terminada em:", gatewayUrl.slice(-8));
      return res.status(502).json({ error: "O gateway retornou uma resposta inesperada. Tente novamente." });
    }

    insertTransaction.run({
      transactionId: String(gatewayResponse.transactionId),
      amount,
      customerName: name,
      customerEmail: email,
      pixCode: String(gatewayResponse.pixCode)
    });

    return res.json({
      transactionId: String(gatewayResponse.transactionId),
      pixCode: String(gatewayResponse.pixCode),
      status: "PENDING",
      amount
    });
  } catch (err) {
    if (err.status && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: "A Duttyfy recusou a cobrança. Verifique a configuração e tente novamente." });
    }
    console.error("Falha ao criar PIX. URL terminada em:", gatewayUrl.slice(-8), "Tipo:", err.name || "Error");
    return res.status(502).json({ error: "Não foi possível gerar o PIX. Atualize a página para tentar novamente." });
  }
});

app.get("/api/pix/status", async (req, res) => {
  const transactionId = String(req.query.transactionId || "").trim();
  if (!transactionId) return res.status(400).json({ error: "transactionId é obrigatório." });

  const local = getTransaction.get(transactionId);
  if (!local) return res.status(404).json({ error: "Transação não encontrada." });

  if (local.status === "COMPLETED") {
    return res.json({ status: "COMPLETED", paidAt: local.paid_at });
  }

  try {
    const url = new URL(gatewayUrl);
    url.searchParams.set("transactionId", transactionId);
    const response = await fetchWithTimeout(url.toString(), { method: "GET" }, 10000);
    if (!response.ok) return res.status(502).json({ error: "Não foi possível consultar o status agora." });

    const data = await response.json();
    if (data.status === "COMPLETED") {
      const paidAt = typeof data.paidAt === "string" ? data.paidAt : new Date().toISOString();
      updateCompleted.run(paidAt, transactionId);
      return res.json({ status: "COMPLETED", paidAt });
    }
    if (data.status === "PENDING") return res.json({ status: "PENDING" });
    return res.status(502).json({ error: "Status inesperado recebido do gateway." });
  } catch (err) {
    console.error("Falha ao consultar status:", err.name || "Error");
    return res.status(502).json({ error: "Erro temporário ao consultar o pagamento." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.listen(port, () => console.log(`Checkout PIX disponível em http://localhost:${port}`));
