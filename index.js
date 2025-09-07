// server.js
import generatePurchaseOrder from "./print.js"; // adjust path if needed

import dotenv from 'dotenv'
import express from 'express';
import bodyParser from 'body-parser';
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

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const pool = new Pool({
    user: process.env.DB_USER,
    host:process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port:process.env.DB_PORT,
});



// =============================
// MIDDLEWARE
// =============================
app.use(cors()); // Enable CORS for API requests
app.use(session({
    secret: 'super-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
// Serve uploaded PDFs so frontend can view them
app.use("/uploads", express.static(uploadsDir));

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

    if (result.rows.length === 0) return `${prefix}001`;

    const lastNumber = result.rows[0].purchase_order_number;
    const sequence = parseInt(lastNumber.slice(-3)) + 1;
    return `${prefix}${String(sequence).padStart(3, "0")}`;
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
                ordered_by as requested_by,
                date_required,
                COALESCE(total_amount, 0) as total_amount,
                status,
                urgency,
                notes,
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
                ordered_by as requested_by,
                date_required,
                COALESCE(total_amount, 0) as total_amount,
                status,
                urgency,
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
        const { supplier_name, urgency, date_required, notes } = req.body;

        const { rows } = await pool.query(
            `UPDATE purchase_orders SET
             supplier_name = $1, urgency = $2, date_required = $3, notes = $4
             WHERE id = $5 RETURNING *`,
            [supplier_name, urgency, date_required, notes, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

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
                res.render('Inventry.ejs', { user, out_fl: email, message: "Login Successful ✅" });
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
app.post("/order_raise", upload.single("quotation"), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: "Not authenticated" });
    


    const { projectName, projectCodeNumber, supplierName, supplierGst, supplierAddress, urgency, dateRequired, notes, reference_no, phone, singleSupplier} = req.body;
    const products = JSON.parse(req.body.products || "[]");
    const orderedBy = req.session.user.email;
    const quotationFile = req.file ? [req.file.filename] : [];

    const contact = phone;
    const single = singleSupplier === 'on' ? true : false;

    try {

        await pool.query("BEGIN");
        const purchaseOrderNumber = await generatePurchaseOrderNumber();

        // Calculate total amount
        let totalAmount = 0;
        for (let p of products) {
            const unitPrice = parseFloat(p.unitPrice);
             const discount=parseFloat(p.discount);
            const quantity = parseInt(p.quantity);


            const gst = parseFloat(p.gst);

            // Calculate item total with GST
            const itemTotal = quantity * unitPrice;
            const discounted= itemTotal-discount;
            const gstAmount = discounted * (gst / 100);

            totalAmount +=discounted+ gstAmount;
        }


        const orderResult = await pool.query(
            `INSERT INTO purchase_orders
            (project_name, project_code_number, purchase_order_number, supplier_name,
             supplier_gst, supplier_address, urgency, date_required, notes,
             ordered_by, quotation_file, total_amount, reference_no, contact, single)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
            [projectName, projectCodeNumber, purchaseOrderNumber, supplierName,
             supplierGst, supplierAddress, urgency, dateRequired, notes,
             orderedBy, quotationFile, totalAmount, reference_no, contact, single]
        );

        const orderId = orderResult.rows[0].id;

        for (let p of products) {
            await pool.query(
                `INSERT INTO purchase_order_items
                (purchase_order_id, part_no, description, hsn_code, quantity, unit_price, gst, project_name,discount,unit)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8,$9,$10)`,
                [orderId, p.partNo, p.description, p.hsn, parseInt(p.quantity), 
                 parseFloat(p.unitPrice), parseFloat(p.gst), projectName,parseFloat(p.discount),p.unit]
            );
        }

        await pool.query("COMMIT");
        
        res.json({ 
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
        res.status(500).json({ success: false, error: "Failed to insert order" });
    }
});

// Logout
app.post('/logout', (req, res) => {
    req.session.destroy(err => err ? res.status(500).send('Could not log out') : res.redirect('/'));
});

// Forgot password
app.get('/forgot', (req, res) => res.sendFile(path.join(__dirname, 'public', 'forgot.html')));

app.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (!result.rows.length) return res.status(404).send("Email not registered");

        const token = crypto.randomBytes(32).toString("hex");
        const expiry = new Date(Date.now() + 3600000);

        await pool.query("UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3", [token, expiry, email]);

        const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: "acc19105@gmail.com", pass: PASSWORD } });
        const resetURL = `http://localhost:3000/reset-password/${token}`;
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
        await transporter.sendMail({ to: email, from: "acc19105@gmail.com", subject: mailSubject, html: mailBody });

        res.sendFile(path.join(__dirname, 'public', 'sucess.html'));
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




// Approve an order (set status to 'pass')
// Move to Purchase Dept
app.put("/api/orders/:id/purchase", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    "UPDATE purchase_orders SET status='purchase' WHERE id=$1 RETURNING *",
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "Order not found" });
  res.json({ success: true, order: rows[0] });
});

// Approve or Reject order


  app.put('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
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
  const { rows } = await pool.query(
    "UPDATE purchase_orders SET status='sent'WHERE id=$1 RETURNING *",
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "Order not found" });
  res.json({ success: true, order: rows[0] });
});

// Mark as Received
app.put("/api/orders/:id/receive", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    "UPDATE purchase_orders SET status='received' WHERE id=$1 RETURNING *",
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "Order not found" });
  res.json({ success: true, order: rows[0] });
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




app.put('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Validate status
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE purchase_orders SET status=$1 WHERE id=$2 RETURNING *`,
      [status, id]
    );

    if (!rows.length) return res.status(404).json({ error: "Order not found" });

    
    res.json({ success: true, order: rows[0] });
  } catch (err) {
    console.error("❌ Error updating status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});




//print test 













app.get("/test", (req, res) => {
  res.send("✅ Test route working");
});




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
    }));

    // 2️⃣ Prepare poData object
   const poData = {
  supplier: {
    name: order.supplier_name,
    address: order.supplier_address,
    contact: order.contact || order.supplier_gst || "N/A",
  },
  poNumber: order.po_number,
  date: new Date(order.created_at).toLocaleDateString(),

  requester: {
    name: order.ordered_by,
    plant: "Aaryan Tech Park", // fixed or from DB
    email: order.ordered_by_email || "example@mail.com",
    
  },

  shipTo: "51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111",
  invoiceTo: "51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111",
  goodsRecipient: "Kiet-ATPLog1",

  termsOfPayment: "45 days net",
  termsOfDelivery: "DAP Ship, address",

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

  signPath: "public/images/wt_img.png",
  company: { logo: "public/images/page_logo.png" },
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




































// purchaseOrder.js










// =============================
// START SERVER
// =============================
app.listen(3000, () => console.log("🚀 Server running at http://localhost:3000"));