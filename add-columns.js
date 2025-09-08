import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function addStatusColumn() {
    try {
        console.log('Adding status column to purchase_order_items table...');

        // Add status column to purchase_order_items if it doesn't exist
        await pool.query(`
            ALTER TABLE purchase_order_items
            ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'
        `);

        console.log('Status column added successfully!');

        // Update existing items to have 'pending' status
        await pool.query(`
            UPDATE purchase_order_items
            SET status = 'pending'
            WHERE status IS NULL
        `);

        console.log('Existing items updated to pending status.');

    } catch (error) {
        console.error('Error adding status column:', error);
    } finally {
        await pool.end();
    }
}

addStatusColumn();
