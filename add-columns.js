import { Pool } from 'pg';

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "kiet",
    password: "Shashi@1504",
    port: 5432
});

async function addColumns() {
    try {
        console.log("Adding reset_token and reset_token_expiry columns to users table...");

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reset_token TEXT,
            ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;
        `);

        console.log("✅ Columns added successfully!");
    } catch (err) {
        console.error("❌ Error adding columns:", err);
    } finally {
        await pool.end();
    }
}

addColumns();
