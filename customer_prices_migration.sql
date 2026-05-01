-- customer_prices: per-customer product pricing
CREATE TABLE IF NOT EXISTS customer_prices (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  unit_price  numeric(10,2) NOT NULL,
  notes       text        NOT NULL DEFAULT '',
  created_at  timestamptz DEFAULT now(),
  UNIQUE (customer_id, product_id)
);

ALTER TABLE customer_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON customer_prices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
