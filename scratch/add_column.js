import { Pool } from 'pg';
const pool = new Pool({
  user: "postgres",
  host: "13.234.3.0",
  database: "mydb",
  password:"KIET@tech123",
  port: 5432,
});

async function run() {
  try {
    await pool.query('ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS received_quantity NUMERIC DEFAULT 0');
    console.log('Column received_quantity added successfully');
  } catch (err) {
    console.error('Error adding column:', err);
  } finally {
    await pool.end();
  }
}

run();
