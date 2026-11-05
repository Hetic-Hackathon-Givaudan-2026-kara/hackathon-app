import express from "express";
import pg from "pg";

// En dev, la configuration vient de api/.env ; en production, de l'hébergeur
try {
  process.loadEnvFile();
} catch {
  // Pas de .env : on garde l'environnement tel quel
}

const { DATABASE_URL } = process.env;
const PORT = Number(process.env.PORT ?? 3000);

const db = new pg.Pool({ connectionString: DATABASE_URL });
const app = express();
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  const { rows } = await db.query("SELECT version()");
  res.json({ status: "ok", db: rows[0].version });
});

app.get("/api/questions", async (_req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM questions ORDER BY id DESC LIMIT 10",
  );
  res.json(rows);
});

// Sans adresse, Node écoute sur toutes les interfaces : joignable hors du conteneur
app.listen(PORT, () => console.log(`API sur http://localhost:${PORT}`));
