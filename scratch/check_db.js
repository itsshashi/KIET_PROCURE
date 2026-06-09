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

async function resetPO635() {
  try {
    // 1. Show current corrupted state
    const { rows: items } = await pool.query(
      "SELECT id, quantity, received_quantity FROM purchase_order_items WHERE purchase_order_id = 635"
    );
    console.log("=== BEFORE RESET (corrupted data) ===");
    items.forEach(item => {
      console.log(`  Item ${item.id}: Ordered=${item.quantity}, Received=${item.received_quantity} -> ${parseFloat(item.received_quantity) >= parseFloat(item.quantity) ? 'COMPLETE' : 'INCOMPLETE'}`);
    });

    // 2. Reset all received_quantity to 0
    await pool.query(
      "UPDATE purchase_order_items SET received_quantity = 0 WHERE purchase_order_id = 635"
    );

    // 3. Reset PO status back to 'sent'
    await pool.query(
      "UPDATE purchase_orders SET status = 'sent' WHERE id = 635"
    );

    // 4. Delete grn_gen_entries for this PO
    await pool.query(
      "DELETE FROM grn_gen_entries WHERE purchase_order_id = 635"
    );

    // 5. Show fixed state
    const { rows: fixedItems } = await pool.query(
      "SELECT id, quantity, received_quantity FROM purchase_order_items WHERE purchase_order_id = 635"
    );
    console.log("\n=== AFTER RESET (clean data) ===");
    fixedItems.forEach(item => {
      console.log(`  Item ${item.id}: Ordered=${item.quantity}, Received=${item.received_quantity}`);
    });

    const { rows: order } = await pool.query(
      "SELECT id, purchase_order_number, status FROM purchase_orders WHERE id = 635"
    );
    console.log(`  PO Status: ${order[0].status}`);
    console.log("\n✅ PO 635 has been reset. You can now test partial receiving.");

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

resetPO635();
