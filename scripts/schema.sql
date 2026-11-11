CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS catalog_items (
  id SERIAL PRIMARY KEY,
  ref_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  application_type VARCHAR(100) NOT NULL,
  sensory_notes TEXT NOT NULL,
  is_natural BOOLEAN DEFAULT true,
  embedding vector(768),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS catalog_items_embedding_ivfflat_idx
  ON catalog_items USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

CREATE TABLE IF NOT EXISTS sample_requests (
  id SERIAL PRIMARY KEY,
  reference_id INT NOT NULL,
  client_name VARCHAR(100),
  shipping_address TEXT NOT NULL,
  quantity INT DEFAULT 1,
  status VARCHAR(50) DEFAULT 'Demandé',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
