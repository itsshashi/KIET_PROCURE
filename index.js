// server.js
import generatePurchaseOrder from "./print.js"; // adjust path if needed


import dotenv from 'dotenv'
import express from 'express';

import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import session from 'express-session';
import multer from 'multer';

import fs from 'fs';
import cors from 'cors';
import bcrypt from 'bcrypt';




// =============================
// CONFIG
// =============================
const app = express();
dotenv.config({ path: "SCR.env" });

const PASSWORD = process.env.EMAIL_PASS;// Gmail app password
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsDir));
// Ensure uploads folder exists
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const pool = new Pool({
  connectionString: "postgresql://postgres:KIetshashaNK2025@database-1.c7iiekukgmcp.ap-south-1.rds.amazonaws.com:5432/postgres",
  ssl: { rejectUnauthorized: false }, // this will bypass self-signed cert errors
});


// =============================
// MIDDLEWARE
// =============================
app.use(cors()); // Enable CORS for API requests
app.use(session({
    secret: 'super-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));
app.use(express.urlencoded({ extended: true ,limit: '50mb'}));

app.use(express.json({ limit: '50mb' }));
// Serve uploaded PDFs so frontend can view them
// Serve uploaded PDFs so frontend can view them



// Serve frontend (place index.html in /public)
app.use(express.static(path.join(__dirname, "public")));


app.use(express.static('public'));
app.set("view engine", "ejs");

// =============================
// HELPERS
// =============================
async function generatePurchaseOrderNumber() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const prefix = `PR${year}${month}`;

    const result = await pool.query(
        `SELECT purchase_order_number
         FROM purchase_orders
         WHERE purchase_order_number LIKE $1
         ORDER BY purchase_order_number DESC
         LIMIT 1`,
        [`${prefix}%`]
    );

    let sequence = 1;
    if (result.rows.length > 0) {
        const lastNumber = result.rows[0].purchase_order_number;
        sequence = parseInt(lastNumber.slice(-3)) + 1;
    }

    while (true) {
        const candidate = `${prefix}${String(sequence).padStart(3, "0")}`;
        const checkResult = await pool.query(
            `SELECT 1 FROM purchase_orders WHERE purchase_order_number = $1`,
            [candidate]
        );
        if (checkResult.rows.length === 0) {
            return candidate;
        }
        sequence++;
    }
}

async function generateGenNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const prefix = `GEN${year}${month}${day}`;

    const result = await pool.query(
        `SELECT gen_number
         FROM grn_gen_entries
         WHERE gen_number LIKE $1
         ORDER BY gen_number DESC
         LIMIT 1`,
        [`${prefix}%`]
    );

    let sequence = 1;
    if (result.rows.length > 0) {
        const lastNumber = result.rows[0].gen_number;
        sequence = parseInt(lastNumber.slice(-3)) + 1;
    }

    while (true) {
        const candidate = `${prefix}${String(sequence).padStart(3, "0")}`;
        const checkResult = await pool.query(
            `SELECT 1 FROM grn_gen_entries WHERE gen_number = $1`,
            [candidate]
        );
        if (checkResult.rows.length === 0) {
            return candidate;
        }
        sequence++;
    }
}

async function generateGrnNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const prefix = `GRN${year}${month}${day}`;

    const result = await pool.query(
        `SELECT grn_number
         FROM grn_gen_entries
         WHERE grn_number LIKE $1
         ORDER BY grn_number DESC
         LIMIT 1`,
        [`${prefix}%`]
    );

    let sequence = 1;
    if (result.rows.length > 0) {
        const lastNumber = result.rows[0].grn_number;
        sequence = parseInt(lastNumber.slice(-3)) + 1;
    }

    while (true) {
        const candidate = `${prefix}${String(sequence).padStart(3, "0")}`;
        const checkResult = await pool.query(
            `SELECT 1 FROM grn_gen_entries WHERE grn_number = $1`,
            [candidate]
        );
        if (checkResult.rows.length === 0) {
            return candidate;
        }
        sequence++;
    }
}
// =============================
// MULTER CONFIG
// =============================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + "-" + file.originalname);
    }
});
const upload = multer({ storage });

// =============================
// API ROUTES FOR ORDERS MANAGEMENT
// =============================

// New endpoint to download uploaded invoice file from inventory_entries





app.get('/api/inventory-invoice/:poNumber', async (req, res) => {
  try {
    const { poNumber } = req.params;
    
    // 1. Get purchase order id by poNumber
    const poResult = await pool.query(
  'SELECT id FROM purchase_orders WHERE po_number = $1',
  [poNumber]
);

    if (poResult.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    const purchaseOrderId = poResult.rows[0].id;

    // 2. Get invoice file from inventory_entries
    const invoiceResult = await pool.query(
      'SELECT invoice_file FROM inventory_entries WHERE purchase_order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [purchaseOrderId]
    );

    if (invoiceResult.rows.length === 0 || !invoiceResult.rows[0].invoice_file) {
      return res.status(404).json({ error: 'Invoice file not found' });
    }

    const invoiceFile = invoiceResult.rows[0].invoice_file;
    const safeFileName = path.basename(invoiceFile); // prevent traversal attacks
    const filePath = path.join(uploadsDir, safeFileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Invoice file not found on server' });
    }

    // 3. Send file for download
    res.sendFile(filePath, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFileName}"`
      }
    });

  } catch (err) {
    console.error('Error downloading inventory invoice:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// API route to generate GRN number
app.post('/api/generate-grn', async (req, res) => {
    try {
        const { order_id } = req.body;
        if (!order_id) {
            return res.status(400).json({ error: 'order_id is required' });
        }

        const orderId = parseInt(order_id);
        if (isNaN(orderId)) {
            return res.status(400).json({ error: 'Invalid order_id' });
        }

        // Get supplier name for the order
        const orderResult = await pool.query(
            'SELECT supplier_name FROM purchase_orders WHERE id = $1',
            [orderId]
        );
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const supplierName = orderResult.rows[0].supplier_name;

        // Check if entry already exists for this order in grn_gen_entries
        const existingResult = await pool.query(
            'SELECT grn_number FROM grn_gen_entries WHERE purchase_order_id = $1',
            [orderId]
        );

        let grn;
        if (existingResult.rows.length > 0 && existingResult.rows[0].grn_number) {
            grn = existingResult.rows[0].grn_number;
        } else {
            // Generate new unique GRN
            grn = await generateGrnNumber();

            // Insert or update grn_gen_entries with the generated GRN
            await pool.query(
                `INSERT INTO grn_gen_entries (purchase_order_id, grn_number, supplier_name)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (purchase_order_id) DO UPDATE SET grn_number = $2, supplier_name = $3`,
                [orderId, grn, supplierName]
            );
        }

        res.json({ grn });
    } catch (err) {
        console.error('Error generating GRN:', err);
        res.status(500).json({ error: 'Failed to generate GRN' });
    }
});

// Get all orders for the orders management interface
app.get('/api/orders', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                id,
                purchase_order_number as order_id,
                project_name as project,
                project_code_number as projectCodeNumber,
                supplier_name as supplier,
                supplier_gst,
                supplier_address,
                shipping_address,
                ordered_by as requested_by,
                date_required,
                COALESCE(total_amount, 0) as total_amount,
                status,
                urgency,
                notes,
                quotation_file,
                single,
                terms_of_payment as payment_terms,
                created_at
            FROM purchase_orders
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all orders for MD section (All Orders tab)
app.get('/api/all-orders', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                id,
                purchase_order_number,
                project_name,
                'Design and Development' as department,
                supplier_name,
                urgency as description,
                ordered_by,
                date_required,
                COALESCE(total_amount, 0) as total_amount,
                status,
                quotation_file,
                created_at
            FROM purchase_orders
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get order by ID
app.get('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query(`
            SELECT
                id,
                purchase_order_number as order_id,
                project_name as project,
                supplier_name as supplier,
                supplier_gst,
                supplier_address,
                shipping_address,
                ordered_by as requested_by,
                date_required,
                COALESCE(total_amount, 0) as total_amount,
                po_number,
                status,
                urgency,
                terms_of_payment as payment_terms,
                notes,
                quotation_file,
                created_at
            FROM purchase_orders
            WHERE id = $1
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get order items by order ID
app.get('/api/orders/:id/items', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query(`
            SELECT
                id,
                part_no as partNo,
                description,
                hsn_code as hsnCode,
                quantity,
                unit_price as unitPrice,
                gst,
                discount,
                unit
            FROM purchase_order_items
            WHERE purchase_order_id = $1
            ORDER BY id
        `, [id]);

        res.json(rows);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update order details
app.put('/api/orders/:id', async (req, res) => {
    try {

        const { id } = req.params;
        const { supplier_name, supplier_gst, supplier_address, payment_terms, expected_date} = req.body;
        const { rows } = await pool.query(
            `UPDATE purchase_orders SET
             supplier_name = $1, supplier_gst = $2, supplier_address = $3, terms_of_payment = $4, date_required = $5
             WHERE id = $6 RETURNING *`,
            [supplier_name, supplier_gst, supplier_address, payment_terms, expected_date, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // If status is 'purchase', send email to MD about amended PO
        

        res.json(rows[0]);
    } catch (err) {
        console.error("Error in PUT /api/orders/:id:", err.stack || err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update order product items
app.put('/api/orders/:id/items', async (req, res) => {
    try {
        const { id } = req.params;
        const { products } = req.body;

        if (!products || !Array.isArray(products)) {
            return res.status(400).json({ error: 'Products array is required' });
        }

        await pool.query("BEGIN");

        // Delete existing items
        await pool.query("DELETE FROM purchase_order_items WHERE purchase_order_id = $1", [id]);

        // Insert new items and calculate total
        let totalAmount = 0;
        for (let p of products) {
            const unitPrice = parseFloat(p.unitPrice);
            const discount = parseFloat(p.discount || 0);
            const quantity = parseInt(p.quantity);
            const gst = parseFloat(p.gst);

            // Calculate item total with GST
            const itemTotal = quantity * unitPrice;
            const discounted = itemTotal - discount;
            const gstAmount = discounted * (gst / 100);
            const finalTotal = discounted + gstAmount;
            totalAmount += finalTotal;

            await pool.query(
                `INSERT INTO purchase_order_items
                (purchase_order_id, part_no, description, hsn_code, quantity, unit_price, gst, discount, unit)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [id, p.partNo, p.description, p.hsnCode, quantity, unitPrice, gst, discount, p.unit]
            );
        }

        // Update total amount in purchase_orders
        await pool.query(
            "UPDATE purchase_orders SET total_amount = $1 WHERE id = $2",
            [totalAmount, id]
        );

        await pool.query("COMMIT");

        res.json({ success: true, totalAmount });
    } catch (err) {
        await pool.query("ROLLBACK");
        console.error("Error in PUT /api/orders/:id/items:", err.stack || err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Search and filter orders
app.get('/api/orders/search/filter', async (req, res) => {
    try {
        const { search, supplier, status, dateFrom, dateTo, requester } = req.query;

        let query = `
            SELECT
                id,
                purchase_order_number as order_id,
                project_name as project,
                supplier_name as supplier,
                supplier_gst,
                supplier_address,
                shipping_address,
                ordered_by as requested_by,
                date_required,
                COALESCE(total_amount, 0) as total_amount,
                status,
                urgency,
                notes,
                quotation_file,
                created_at
            FROM purchase_orders
            WHERE 1=1
        `;

        let params = [];
        let paramCount = 0;

        if (search) {
            paramCount++;
            query += ` AND (purchase_order_number ILIKE $${paramCount} OR project_name ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }

        if (supplier && supplier !== 'All Suppliers') {
            paramCount++;
            query += ` AND supplier_name = $${paramCount}`;
            params.push(supplier);
        }

        if (status && status !== 'All Statuses') {
            paramCount++;
            query += ` AND status = $${paramCount}`;
            params.push(status.toLowerCase());
        }

        if (dateFrom) {
            paramCount++;
            query += ` AND date_required >= $${paramCount}`;
            params.push(dateFrom);
        }

        if (dateTo) {
            paramCount++;
            query += ` AND date_required <= $${paramCount}`;
            params.push(dateTo);
        }

        if (requester && requester !== 'All Requesters') {
            paramCount++;
            query += ` AND ordered_by = $${paramCount}`;
            params.push(requester);
        }

        query += ' ORDER BY created_at DESC';

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get orders for inventory processing
app.get('/api/inventory-orders', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                id,
                purchase_order_number as order_id,
                project_name as project,
                supplier_name as supplier,
                supplier_gst,
                supplier_address,
                shipping_address,
                ordered_by as requested_by,
                date_required,
                COALESCE(total_amount, 0) as total_amount,
                status,
                urgency,
                notes,
                quotation_file,
                created_at
            FROM purchase_orders
            WHERE status IN ('sent', 'received')
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST route to handle inventory form submission from Inventory.ejs
app.post('/submit-inventory', upload.single('invoice'), async (req, res) => {
    // if (!req.session.user) {
    //     return res.status(401).json({ success: false, error: 'Not authenticated' });
    // }

    try {
        const {
            order_id,
            grn,
            supplier_account_number,
            supplier_account_name,
            supplier_ifsc_code,
            amount,
            shift_code
        } = req.body;

        // Validate required fields
        if (!order_id || !grn) {
            return res.status(400).json({ success: false, error: 'Order ID and GRN are required' });
        }

        // Check if invoice file is uploaded
        const invoiceFile = req.file ? req.file.filename : null;

        // Insert inventory entry into inventory_entries table
        const insertQuery = `
            INSERT INTO inventory_entries
            (purchase_order_id, grn_number, invoice_file, supplier_account_number, supplier_account_name, supplier_ifsc_code, amount, shift_code, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;

        const values = [
            order_id,
            grn,
            invoiceFile,
            supplier_account_number || null,
            supplier_account_name || null,
            supplier_ifsc_code || null,
            amount ? parseFloat(amount) : null,
            shift_code || null,
            req.session.user.email
        ];

        const { rows } = await pool.query(insertQuery, values);

        // Optionally update purchase_orders status to 'inventory_processed' for the order
        await pool.query(
            "UPDATE purchase_orders SET status = 'inventory_processed' WHERE id = $1",
            [order_id]
        );

        // Update grn_gen_entries with grn_number
        try {
            await pool.query(
                `UPDATE grn_gen_entries SET grn_number = $1 WHERE purchase_order_id = $2`,
                [grn, order_id]
            );
        } catch (err) {
            console.error('Error updating grn_gen_entries:', err);
            // Continue, as inventory entry succeeded
        }

        res.json({ success: true, message: 'Inventory entry submitted successfully', entry: rows[0] });
    } catch (error) {
        console.error('Error submitting inventory entry:', error);
        res.status(500).json({ success: false, error: 'Failed to submit inventory entry' });
    }
});

// =============================
// EXISTING ROUTES (KEEP THESE AS IS)
// =============================

// Home / Login
app.get('/', (req, res) => res.render('index.ejs', { message: "" }));

// Login submit
app.post('/submit', async (req, res) => {
    const { email, password, role } = req.body;

    try {
        const result = await pool.query(
            "SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))",
            [email]
        );

        if (!result.rows.length) 
            return res.render("index.ejs", { message: "Invalid email or password" });

        const user = result.rows[0];

        // Compare hashed password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) 
            return res.render("index.ejs", { message: "Invalid email or password" });

        if (user.role !== role) 
            return res.render("index.ejs", { message: "Unauthorized: Incorrect role" });

        // Set session
        req.session.user = { id: user.id, email: user.email, role: user.role };

        // Render dashboard based on role
        switch (user.role) {
            case "Employee":
                res.render('procurement.ejs', { user, out_fl: email, message: "Login Successful ✅" });
                break;
            case "Purchase":
                res.render('Purchase.ejs', { user, out_fl: email, message: "Login Successful ✅" });
                break;
            case "Security":
                res.render('Security.ejs', { user, out_fl: email, message: "Login Successful ✅" });
                break;
            case "Inventory":
                res.render('Inventory.ejs', { user, out_fl: email, message: "Login Successful ✅" });
                break;
            case "Accounts":
                res.render('Accounts.ejs', { user, out_fl: email, message: "Login Successful ✅" });
                break;
            case "MD":
                res.render('Md.ejs', { user, out_fl: email, message: "Login Successful ✅" });
                break;
            default:
                res.render("index.ejs", { message: "Role not recognized" });
        }

    } catch (err) {
        console.error(err);
        res.status(500).send("Error processing request");
    }
});


// Order Raise
// Order Raise
// Safe wrapper for multer
const safeUpload = (req, res, next) => {
  upload.single("quotation")(req, res, (err) => {
    if (err) {
      console.error("❌ Multer Error:", err);
      return res.status(400).json({
        success: false,
        error: "File upload failed: " + err.message
      });
    }
    next();
  });
};

app.post("/order_raise", safeUpload, async (req, res) => {
  console.log("Starting order_raise request");

  // 🔹 Session check
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      error: "Not authenticated"
    });
  }

  const {
    projectName,
    projectCodeNumber,
    supplierName,
    supplierGst,
    supplierAddress,
    shippingAddress,
    urgency,
    dateRequired,
    notes,
    reference_no,
    phone,
    singleSupplier,
    termsOfPayment
  } = req.body;

  let products;
  try {
    products = JSON.parse(req.body.products || "[]");
    console.log("Products parsed:", products.length);
  } catch (parseErr) {
    return res.status(400).json({
      success: false,
      error: "Invalid products data"
    });
  }

  const orderedBy = req.session.user.email;
  const quotationFile = req.file ? [req.file.filename] : [];
  console.log("Quotation file:", quotationFile);

  const contact = phone;
  const single = singleSupplier === "on";

  try {
    console.log("About to begin transaction");
    await pool.query("BEGIN");

    const purchaseOrderNumber = await generatePurchaseOrderNumber();
    console.log("PO number generated:", purchaseOrderNumber);

    let totalAmount = 0;
    for (let p of products) {
      const unitPrice = parseFloat(p.unitPrice);
      const discount = parseFloat(p.discount);
      const quantity = parseInt(p.quantity);
      const gst = parseFloat(p.gst);

      const itemTotal = quantity * unitPrice;
      const discounted = itemTotal - discount;
      const gstAmount = discounted * (gst / 100);

      totalAmount += discounted + gstAmount;
    }
    console.log("Total calculated:", totalAmount);

    console.log("About to insert order");
    const orderResult = await pool.query(
      `INSERT INTO purchase_orders
        (project_name, project_code_number, purchase_order_number, supplier_name,
         supplier_gst, supplier_address, shipping_address, urgency, date_required, notes,
         ordered_by, quotation_file, total_amount, reference_no, contact, single, terms_of_payment)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [
        projectName, projectCodeNumber, purchaseOrderNumber, supplierName,
        supplierGst, supplierAddress, shippingAddress, urgency, dateRequired, notes,
        orderedBy, quotationFile, totalAmount, reference_no, contact, single, termsOfPayment
      ]
    );
    console.log("Order inserted");

    const orderId = orderResult.rows[0].id;

    console.log("About to insert items");
    for (let p of products) {
      await pool.query(
        `INSERT INTO purchase_order_items
          (purchase_order_id, part_no, description, hsn_code, quantity, unit_price, gst, project_name, discount, unit)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          orderId, p.partNo, p.description, p.hsn, parseInt(p.quantity),
          parseFloat(p.unitPrice), parseFloat(p.gst), projectName,
          parseFloat(p.discount), p.unit
        ]
      );
    }

    await pool.query("COMMIT");
    console.log("Transaction committed");

    // 🔹 Send email (keep your existing code)
  const transporte = nodemailer.createTransport({
            host: "smtp.office365.com",
            port: 587,
            secure: false, // STARTTLS
            auth: {
              user: "No-reply@kietsindia.com",
              pass: "Kiets@2025$1",
            },
            tls: {
              rejectUnauthorized: false,
            },
          });

        const mailOptions = {
            from: "NO-reply@kietsindia.com",
            to: "purchase@kietsindia.com",
            subject: `New Order Raised: Approval Required for Order ${purchaseOrderNumber}`,
            text: `
Hello Purchase Team,

A new order has been raised and requires your approval.

📌 Order Details:
- Order Number: ${purchaseOrderNumber}
- Supplier: ${supplierName}
- Requester: ${orderedBy}
- Date: ${new Date().toLocaleDateString()}
- Total Amount: ₹${totalAmount}

👉 Please review and approve the order here:
https://kietprocure.com

Best regards,
Procurement Team
KIET TECHNOLOGIES PVT LTD,
            `,
            attachments: [
    {
      filename: "lg.jpg",          // your image file name
      path: "public/images/lg.jpg",            // local path to the image
      cid: "logoImage"               // same cid as in <img src="cid:logoImage">
    }
  ]
        };

        try {
            const info = await transporte.sendMail(mailOptions);
            console.log("✅ Email sent to purchase orders:", info.response);
        } catch (err) {
            console.error("❌ Email failed:", err);
        }

    // 🔹 Success JSON
    return res.json({
      success: true,
      message: "✅ Order inserted successfully",
      purchaseOrderNumber,
      orderedBy,
      file: quotationFile,
      totalAmount
    });

  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("❌ Error inserting order:", err);
    return res.status(500).json({
      success: false,
      error: `Failed to insert order: ${err.message || "Unknown error"}`
    });
  }
});

// 🔹 Global error handler (keeps JSON output always)
app.use((err, req, res, next) => {
  console.error("🔥 Global Error Handler:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
});


// Logout
app.post('/logout', (req, res) => {
    req.session.destroy(err => err ? res.status(500).send('Could not log out') : res.redirect('/'));
});

// Forgot password
app.get('/forgot', (req, res) => res.sendFile((path.join(__dirname, 'public/forgot.html'))));

app.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (!result.rows.length) return res.status(404).send("Email not registered");

        const token = crypto.randomBytes(32).toString("hex");
        const expiry = new Date(Date.now() + 3600000);

        await pool.query("UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3", [token, expiry, email]);

      const transporter = nodemailer.createTransport({
            host: "smtp.office365.com",
            port: 587,
            secure: false, // STARTTLS
            auth: {
              user: "No-reply@kietsindia.com",
              pass: "Kiets@2025$1",
            },
            tls: {
              rejectUnauthorized: false,
            },
          });


const resetURL = `https://kietprocure.com/reset-password/${token}`;
const mailSubject = "Password Reset Request - KIET Technologies";
const mailBody = `
  <p>Hello ${email},</p>
  <p>We received a request to reset your password for your KIET Technologies account.</p>
  <p>If you made this request, please click the link below to reset your password:</p>
  <p><a href="${resetURL}">Reset Password</a></p>
  <p>This link will expire in 15 minutes for security reasons.</p>
  <p>If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.</p>
  <p>Thank you,<br>The KIET Technologies Team</p>
`;

await transporter.sendMail({
  from: '"KIET Technologies" <no-reply@kietsindia.com>', // display name + Office 365 email
  to: email,
  subject: mailSubject,
  html: mailBody,
});

        res.sendFile(path.join(__dirname, 'public/sucess.html'));
    } catch (err) {
        console.error(err);
        res.status(500).send("Error processing request");
    }
});

// Show reset password form
// Show reset password form
app.get("/reset-password/:token", async (req, res) => {
  const { token } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()",
      [token]
    );

    if (result.rows.length === 0) {
      return res.send("Invalid or expired reset token");
    }

    // Render reset form with hidden token
    res.render("reset-password.ejs", { token });
  } catch (error) {
    console.error(error);
    res.send("Something went wrong");
  }
});


// Handle reset password submission
app.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const user = result.rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2",
      [hashedPassword, user.id]
    );

    res.json({ success: true, message: "Password reset successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});





app.get('/api/account-details', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    // Build the base query to fetch purchase orders with status 'sent', left join with inventory_entries for bank details
    let query = `
      SELECT
        po.id as id,
        po.po_number as po_number,
        po.supplier_name,
        po.terms_of_payment,
        po.total_amount as amount,
        ie.supplier_account_number,
        ie.supplier_account_name,
        ie.supplier_ifsc_code
      FROM purchase_orders po
      LEFT JOIN inventory_entries ie ON po.id = ie.purchase_order_id
      WHERE po.status IN ( 'inventory_processed')
    `;
    let params = [];
    let paramCount = 0;

    // If po_number is provided, filter by it
    if (req.query.po_number && typeof req.query.po_number === 'string' && req.query.po_number.trim() && req.query.po_number !== '[object Event]') {
      paramCount++;
      query += ` AND po.purchase_order_number = $${paramCount}`;
      params.push(req.query.po_number.trim());
    }

    // If the user role is not 'Accounts', restrict results to orders placed by the logged-in user
    if (req.session.user.role !== 'Accounts') {
      paramCount++;
      query += ` AND po.ordered_by = $${paramCount}`;
      params.push(req.session.user.email);
    }

    // Order the results by creation date, descending
    query += ' ORDER BY po.created_at DESC';



    const { rows } = await pool.query(query, params);



    if (rows.length === 0) {
      return res.json({ message: 'No payment details found' });
    }

    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching account details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});





//newly added for sending mail in account.ejs

app.post('/api/send-email/:id', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const { id } = req.params;

    // Fetch order details
    const orderResult = await pool.query(
      'SELECT ordered_by, po_number FROM purchase_orders WHERE id = $1',
      [id]
      
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { ordered_by, po_number ,} = orderResult.rows[0];

    // Send email
     const transporte = nodemailer.createTransport({
            host: "smtp.office365.com",
            port: 587,
            secure: false, // STARTTLS
            auth: {
              user: "No-reply@kietsindia.com",
              pass: "Kiets@2025$1",
            },
            tls: {
              rejectUnauthorized: false,
            },
          });

    const mailSubject = "Payment Notification - KIET Technologies";
    const mailBody = `
      <p>Hello ${ordered_by},</p>
      <p>Your payment for PO ${po_number} has been processing,Could you Please send Confirmation email to accounts@kietsindia.com.</p>
      <p>Thank you,<br>The KIET Technologies Team</p>
    `;

    await transporte.sendMail({ to: ordered_by, from: "No-reply@kietsindia.com", subject: mailSubject, html: mailBody });

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});













app.get("/status", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const result = await pool.query(
            `SELECT id,
            project_name AS "projectName",
            project_code_number AS "projectCodeNumber",
            purchase_order_number AS "purchaseOrderNumber",
            supplier_name AS "supplierName",
            supplier_gst AS "supplierGst",
            supplier_address AS "supplierAddress",
            shipping_address AS "shippingAddress",
            contact,
            single,
            urgency,
            date_required AS "dateRequired",
            created_at AS "dateRequested",
            status,
            quotation_file AS "quotationFile",
            notes
        FROM purchase_orders
        WHERE ordered_by = $1
        ORDER BY id DESC`,
      [req.session.user.email]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching status:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Update quotation file (Edit) - Single file
app.put("/api/orders/:id/quotation", upload.single("quotation"), async (req, res) => {
    try {
        const { id } = req.params;
        console.log(req.params);
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const newFile = req.file.filename;

        // Delete old file if exists
        // const oldFileResult = await pool.query("SELECT quotation_file FROM purchase_orders WHERE id=$1", [id]);
        // if (oldFileResult.rows.length && oldFileResult.rows[0].quotation_file) {
        //     const oldFilePath = path.join(uploadsDir, oldFileResult.rows[0].quotation_file);
        //     if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
        // }

        // Update DB
        const { rows } = await pool.query(
            "UPDATE purchase_orders SET quotation_file= array_append(quotation_file,$1) WHERE id=$2 RETURNING *",
            [newFile, id]
        );

        res.json({ success: true, order: rows[0] });
    } catch (err) {
        console.error("❌ Error updating quotation:", err);
        res.status(500).json({ error: "Failed to update quotation" });
    }
});

app.post("/api/orders/:id/quotations", upload.array("quotations"), async (req, res) => {
  try {
    const { id } = req.params;

    // filenames of uploaded files
    const newFiles = req.files.map(file => file.filename);

    // Append to existing array instead of overwrite
    const result = await pool.query(
      `UPDATE purchase_orders
       SET quotation_file = quotation_file || $1::text[]
       WHERE id = $2
       RETURNING *`,
      [newFiles, id]
    );

    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    console.error("Upload quotations error:", err);
    res.status(500).json({ success: false, error: "Failed to upload quotations" });
  }
});




app.put("/api/orders/:id/purchase", async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      "UPDATE purchase_orders SET status='purchase' WHERE id=$1 RETURNING *",
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found" });

    
    
    
    // Setup transporter
    const transporte = nodemailer.createTransport({
                       host: "smtp.office365.com",
            port: 587,
            secure: false, // STARTTLS
            auth: {
              user: "No-reply@kietsindia.com",
              pass: "Kiets@2025$1",
            },
            tls: {
              rejectUnauthorized: false,
            },
          });


    const mailOptions = {
      from: "No-reply@kietsindia.com",
  to: "chandrashekaraiah.r@kietsindia.com",
  subject: `Action Required: Final Approval Needed for Order ${rows[0].purchase_order_number}`,
  text: `
Hello,

The order ${rows[0].purchase_order_number} has been approved in Purchase.com and now requires your attention for final approval.

📌 Order Details:
- Order Number: ${rows[0].purchase_order_number}
- Supplier: ${rows[0].supplier_name || "N/A"}
- Requester: ${rows[0].ordered_by || "N/A"}
- Date: ${rows[0].order_date || new Date().toLocaleDateString()}
- Total Amount: ₹${rows[0].total_amount || "N/A"}

👉 Please complete the final approval here:  
https://kietprocure.com

Best regards,  
Purchase Team
KIET TECHNOLOGIES PVT LTD,
  `,
  attachments: [
    {
      filename: "lg.jpg",          // your image file name
      path: "public/images/lg.jpg",            // local path to the image
      cid: "logoImage"               // same cid as in <img src="cid:logoImage">
    }
  ]

    };

    try {
      const info = await transporte.sendMail(mailOptions);
      console.log("✅ Email sent:", info.response);
    } catch (err) {
      console.error("❌ Email failed:", err);
    }





    // Only now send response back to frontend
    res.json({ success: true, order: rows[0] });

  } catch (err) {
    console.error("❌ Error updating purchase status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Approve or Reject order


  app.put('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected', 'paid'].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const { rows } = await pool.query(
      "UPDATE purchase_orders SET status=$1 WHERE id=$2 RETURNING *",
      [status, id]
    );

    if (!rows.length) return res.status(404).json({ error: "Order not found" });




  

    res.json({ success: true, order: rows[0] });
  } catch (err) {
    console.error("❌ Error updating status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



//suggestion
app.get("/supplier/:name", async (req, res) => {
  try {
    const { name } = req.params; // use "name" because route is /supplier/:name

    const result = await pool.query(
     "SELECT supplier_name, supplier_address, supplier_gst, contact FROM purchase_orders WHERE supplier_name ILIKE $1 ORDER BY created_at DESC LIMIT 1",
    [`%${name}%`]
);


    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ message: "Supplier not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});





// Send PO
app.put("/api/orders/:id/send", async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      "UPDATE purchase_orders SET status='sent' WHERE id=$1 RETURNING *",
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found" });

    const order = rows[0];

    // Send email notification to requester
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: "No-reply@kietsindia.com",
        pass: "Kiets@2025$1",
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const mailOptions = {
      from: "No-reply@kietsindia.com",
      to: order.ordered_by,
      subject: `Purchase Order Sent - Order ${order.purchase_order_number}`,
      text: `
Hello ${order.ordered_by},

Your purchase order has been processed and sent to the supplier.

📌 Order Details:
- Order Number: ${order.purchase_order_number}
- Project: ${order.project_name}
- Supplier: ${order.supplier_name}
- Total Amount: ₹${order.total_amount}
- Status: Sent

The PO PDF has been generated and sent to the supplier. Please contact the purchase team if you have any questions.

Best regards,
Purchase Team
KIET TECHNOLOGIES PVT LTD,
      `,
      attachments: [
        {
          filename: "lg.jpg",
          path: "public/images/lg.jpg",
          cid: "logoImage"
        }
      ]
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("✅ Email sent to requester:", info.response);
    } catch (err) {
      console.error("❌ Email failed:", err);
    }

    res.json({ success: true, order: order });
  } catch (err) {
    console.error("❌ Error sending PO:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mark as Received
app.put("/api/orders/:id/receive", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    "UPDATE purchase_orders SET status='received' WHERE id=$1 RETURNING supplier_name",
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "Order not found" });

  const supplierName = rows[0].supplier_name;

  // Generate gen_number and insert into grn_gen_entries
  const genNumber = await generateGenNumber();
  try {
    await pool.query(
      `INSERT INTO grn_gen_entries (purchase_order_id, gen_number, grn_number, supplier_name)
       VALUES ($1, $2, NULL, $3)`,
      [id, genNumber, supplierName]
    );
  } catch (err) {
    console.error('Error inserting into grn_gen_entries:', err);
    // Continue, as order update succeeded
  }

  res.json({ success: true, order: rows[0], genNumber });
});





//md
// Get only purchase-enquired orders
app.get("/api/purchase-orders", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM purchase_orders WHERE status IN ('enquired','purchase') ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching purchase orders:", err);
    res.status(500).json({ error: "Failed to fetch purchase orders" });
  }
});

// Get all quotations for MD section (All Quotations tab)
app.get("/api/all-quotations", async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC', search, supplier, status, dateFrom, dateTo } = req.query;

    let query = `
      SELECT
        id,
        purchase_order_number as order_id,
        project_name as project,
        supplier_name as supplier,
        ordered_by as requested_by,
        date_required,
        COALESCE(total_amount, 0) as total_amount,
        status,
        quotation_file,
        created_at
      FROM purchase_orders
      WHERE quotation_file IS NOT NULL AND array_length(quotation_file, 1) > 0
    `;

    let params = [];
    let paramCount = 0;

    // Add filters
    if (search) {
      paramCount++;
      query += ` AND (purchase_order_number ILIKE $${paramCount} OR project_name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (supplier && supplier !== 'All Suppliers') {
      paramCount++;
      query += ` AND supplier_name = $${paramCount}`;
      params.push(supplier);
    }

    if (status && status !== 'All Statuses') {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status.toLowerCase());
    }

    if (dateFrom) {
      paramCount++;
      query += ` AND date_required >= $${paramCount}`;
      params.push(dateFrom);
    }

    if (dateTo) {
      paramCount++;
      query += ` AND date_required <= $${paramCount}`;
      params.push(dateTo);
    }

    // Add sorting
    query += ` ORDER BY ${sortBy} ${sortOrder}`;

    // Add pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM purchase_orders
      WHERE quotation_file IS NOT NULL AND array_length(quotation_file, 1) > 0
    `;
    const { rows: countRows } = await pool.query(countQuery);
    const total = parseInt(countRows[0].total);

    res.json({
      quotations: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("❌ Error fetching all quotations:", err);
    res.status(500).json({ error: "Failed to fetch quotations" });
  }
});








//print test 













app.get("/test", (req, res) => {
  res.send("✅ Test route working");
});

// Test email functionality





app.get("/api/orders/:id/pdf", async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Fetch order details from DB
    const orderResult = await pool.query(
      "SELECT * FROM purchase_orders WHERE id = $1",
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const order = orderResult.rows[0];


    // Fetch order items
    const itemsResult = await pool.query(
      "SELECT * FROM purchase_order_items WHERE purchase_order_id = $1",
      [id]
    );
    
    const items = itemsResult.rows.map(row => ({
      part_no: row.part_no,
      description: row.description,
      hsn_code: row.hsn_code,
      gst: row.gst,
      quantity: row.quantity,
      unit: row.unit || "pcs",
      unit_price: Number(row.unit_price) || 0,
      discount:row.discount || 0
    }));

    // 2️⃣ Prepare poData object
   const poData = {
  supplier: {
    name: order.supplier_name,
    address: order.supplier_address,
    contact: order.contact  || "N/A",
    gst:order.supplier_gst||"N/A"

  },
  poNumber: order.po_number|| 'UNKNOWN',
  reference_no: order.reference_no,
  date: new Date(order.created_at).toLocaleDateString(),
  expected_date: order.date_required 
   ? new Date(order.date_required).toLocaleDateString("en-GB") 
   : "N/A"
,
  delivery_through:order.delevery_by,
  projectcode:order.project_code_number,

  requester: {
    name: order.ordered_by,
    plant: "Aaryan Tech Park", // fixed or from DB
    email: order.ordered_by_email || "example@mail.com",

  },

  shipTo: order.shipping_address,
  invoiceTo: "KIET TECHNOLOGIES PVT.LTD ,51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111",
  goodsRecipient: "Kiet-ATPLog1",

  termsOfPayment: order.terms_of_payment,


  items: items, // from DB query purchase_order_items

  amountInWords: "INR Twenty Six Thousand Nine Hundred Four Only", // use converter
  terms: `
    1. The supplier shall comply with all applicable laws, export regulations, and ethical business practices at all times.
    2. Any form of bribery, gratification, or involvement of restricted materials is strictly prohibited.
    3. The goods supplied must not contain iron or steel originating from sanctioned countries.
    4. All invoices must exactly match the purchase order details and clearly reference the PO number.
    5. Payments will be made within 45 days from goods receipt or invoice receipt, whichever is applicable.
    6. Deliveries accepted only Mon–Fri 9:00 AM to 5:00 PM, routed through designated material gates.
    7. Each delivery must be accompanied by three copies of the invoice.
    8. Supplier personnel entering premises must wear safety shoes and carry valid ID, license & vehicle docs.
    9. Buyer reserves the right to reject goods or terminate this PO for non-compliance.
  `,

  signPath: "public/images/signature.png",
  company: { logo: "public/images/lg.jpg" },
  line: 'public/images/line.png',

};


    // 3️⃣ Generate unique filename
    const timestamp = Date.now();
    const fileName = `PO_${order.po_number}_${timestamp}.pdf`;
    const filePath = path.join(uploadsDir, fileName);

    // 4️⃣ Generate PDF
    generatePurchaseOrder(poData, filePath);

    // 5️⃣ Send PDF as response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Wait a bit for PDF generation to complete, then send file
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath, (err) => {
          if (err) {
            console.error("Error sending PDF:", err);
            res.status(500).json({ error: "Failed to send PDF" });
          } else {
            // Optionally delete the file after sending
            // fs.unlinkSync(filePath);
          }
        });
      } else {
        res.status(500).json({ error: "PDF generation failed - file not found" });
      }
    }, 1000); // Wait 1 second for PDF generation

  } catch (err) {
    console.error("❌ Error generating PDF:", err.stack || err);
    res.status(500).json({ error: err.message || "Failed to generate PDF" });
  }
});

app.get("/api/invoice/:poNumber", async (req, res) => {
  try {
    const { poNumber } = req.params;

    // Fetch order by po_number
    const orderResult = await pool.query(
      "SELECT * FROM purchase_orders WHERE purchase_order_number = $1",
      [poNumber]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const order = orderResult.rows[0];

    // Fetch order items
    const itemsResult = await pool.query(
      "SELECT * FROM purchase_order_items WHERE purchase_order_id = $1",
      [order.id]
    );
    const items = itemsResult.rows.map(row => ({
      part_no: row.part_no,
      description: row.description,
      hsn_code: row.hsn_code,
      gst: row.gst,
      quantity: row.quantity,
      unit: row.unit || "pcs",
      unit_price: Number(row.unit_price) || 0,
      discount: row.discount || 0
    }));

    // Prepare poData object (using same as PO for now)
    const poData = {
      supplier: {
        name: order.supplier_name,
        address: order.supplier_address,
        contact: order.contact || "N/A",
        gst: order.supplier_gst || "N/A"
      },
      poNumber: order.purchase_order_number,
      reference_no: order.reference_no,
      date: new Date(order.created_at).toLocaleDateString(),
      requester: {
        name: order.ordered_by,
        plant: "Aaryan Tech Park",
        email: order.ordered_by_email || "example@mail.com",
      },
      shipTo: order.shipping_address,
      invoiceTo: "KIET TECHNOLOGIES PVT.LTD ,51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111",
      goodsRecipient: "Kiet-ATPLog1",
      termsOfPayment: order.terms_of_payment,
      items: items,
      amountInWords: "N/A",
      terms: `
        1. The supplier shall comply with all applicable laws, export regulations, and ethical business practices at all times.
        2. Any form of bribery, gratification, or involvement of restricted materials is strictly prohibited.
        3. The goods supplied must not contain iron or steel originating from sanctioned countries.
        4. All invoices must exactly match the purchase order details and clearly reference the PO number.
        5. Payments will be made within 45 days from goods receipt or invoice receipt, whichever is applicable.
        6. Deliveries accepted only Mon–Fri 9:00 AM to 5:00 PM, routed through designated material gates.
        7. Each delivery must be accompanied by three copies of the invoice.
        8. Supplier personnel entering premises must wear safety shoes and carry valid ID, license & vehicle docs.
        9. Buyer reserves the right to reject goods or terminate this PO for non-compliance.
      `,
      signPath: "public/images/signature.png",
      company: { logo: "public/images/page_logo.png" },
      line:'public/images/line.png'
    };

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `Invoice_${poNumber}_${timestamp}.pdf`;
    const filePath = path.join(uploadsDir, fileName);

    // Generate PDF (using PO generator for now)
    generatePurchaseOrder(poData, filePath);

    // Send PDF as response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Wait a bit for PDF generation to complete, then send file
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath, (err) => {
          if (err) {
            console.error("Error sending invoice PDF:", err);
            res.status(500).json({ error: "Failed to send invoice PDF" });
          }
        });
      } else {
        res.status(500).json({ error: "Invoice PDF generation failed - file not found" });
      }
    }, 1000); // Wait 1 second for PDF generation

  } catch (err) {
    console.error("❌ Error generating invoice PDF:", err.stack || err);
    res.status(500).json({ error: err.message || "Failed to generate invoice PDF" });
  }
});




































// purchaseOrder.js








const PORT = process.env.PORT || 3000; // use Render's PORT if available
app.listen(PORT, () => console.log(`🚀 Server running on port! ${PORT}`));

