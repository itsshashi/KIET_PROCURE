import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  user: "postgres",
  host: "13.234.3.0",
  database: "mydb",
  password:"KIET@tech123",
  port: 5432,
});

async function reset() {
  await pool.query("UPDATE purchase_order_items SET received_quantity = 0 WHERE purchase_order_id = 635");
  await pool.query("UPDATE purchase_orders SET status = 'sent' WHERE id = 635");
  await pool.query("DELETE FROM grn_gen_entries WHERE purchase_order_id = 635");
  console.log("✅ PO 635 reset. All items received_quantity=0, status=sent");
  await pool.end();
}

reset();
