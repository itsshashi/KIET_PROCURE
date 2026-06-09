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

async function testFilter() {
  try {
    const status = 'sent,partial';
    const statusList = status.split(',').map(s => s.trim().toLowerCase());
    
    let query = "SELECT id, purchase_order_number as order_id, status FROM purchase_orders WHERE 1=1";
    let params = [];
    let paramCount = 0;

    if (statusList.length > 0) {
      paramCount++;
      query += ` AND status = ANY($${paramCount})`;
      params.push(statusList);
    }

    console.log('Query:', query);
    console.log('Params:', params);

    const { rows } = await pool.query(query, params);
    console.log(`Found ${rows.length} rows.`);
    if (rows.length > 0) {
      console.log('First row:', rows[0]);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

testFilter();
