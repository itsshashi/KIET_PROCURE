// server.js
import generatePurchaseOrder from "./print.js"; // adjust path if needed


import generateDeliveryChallan from "./dc.js";
import { loadModels, getDescriptor, distance } from "./face.js";
import fetch from "node-fetch";

import dotenv from "dotenv";
dotenv.config();
import express from "express";

import path, { parse } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import crypto from "crypto";
import nodemailer from "nodemailer";
import session from "express-session";
import multer from "multer";

import fs from "fs";
import cors from "cors";
import bcrypt from "bcrypt";
import generateQuotation from "./trade.js";
import generateVKQuotation from "./vk.js";
import generateMAEQuotation from "./mae.js";
import { query } from "express-validator";
import { sendNotification } from "./routes/pushNotifications.js";
import { assign } from "nodemailer/lib/shared/index.js";
const db_pass = process.env.DB_PASSWORD;
// =============================
// CONFIG
// =============================
const app = express();


const PASSWORD = process.env.EMAIL_PASS; // Gmail app password
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsDir));
// Ensure uploads folder exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const qtUploadsDir = path.join(__dirname, "qt_uploads");
// Ensure qt_uploads folder exists
if (!fs.existsSync(qtUploadsDir)) {
  fs.mkdirSync(qtUploadsDir, { recursive: true });
}
await loadModels();
console.log("✅ Face models loaded");
const pool = new Pool({
  user: "postgres",
  host: "13.234.3.0",
  database: "mydb",
  password:process.env.DB_PASSWORD,
  port: 5432,
});
app.use('/qt_uploads', express.static(path.join(__dirname, 'qt_uploads')));


// =============================
// MIDDLEWARE
// =============================
app.use(cors()); // Enable CORS for API requests
app.use(
  session({
    secret: "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  })
);
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(express.json({ limit: "50mb" }));
// Serve uploaded PDFs so frontend can view them
// Serve uploaded PDFs so frontend can view them

// Serve frontend (place index.html in /public)
app.use(express.static(path.join(__dirname, "public")));

app.use(express.static("public"));
app.set("view engine", "ejs");

// Use quotation routes

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
  },
});
const upload = multer({ storage });

// =============================
// API ROUTES FOR ORDERS MANAGEMENT
// =============================

// New endpoint to download uploaded invoice file from inventory_entries

app.get("/api/inventory-invoice/:poNumber", async (req, res) => {
  try {
    const { poNumber } = req.params;

    // 1. Get purchase order id by poNumber
    const poResult = await pool.query(
      "SELECT id FROM purchase_orders WHERE po_number = $1",
      [poNumber]
    );

    if (poResult.rows.length === 0) {
      return res.status(404).json({ error: "Purchase order not found" });
    }

    const purchaseOrderId = poResult.rows[0].id;

    // 2. Get invoice file from inventory_entries
    const invoiceResult = await pool.query(
      "SELECT invoice_file FROM inventory_entries WHERE purchase_order_id = $1 ORDER BY created_at DESC LIMIT 1",
      [purchaseOrderId]
    );

    if (
      invoiceResult.rows.length === 0 ||
      !invoiceResult.rows[0].invoice_file
    ) {
      return res.status(404).json({ error: "Invoice file not found" });
    }

    const invoiceFile = invoiceResult.rows[0].invoice_file;
    const safeFileName = path.basename(invoiceFile); // prevent traversal attacks
    const filePath = path.join(uploadsDir, safeFileName);

    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ error: "Invoice file not found on server" });
    }

    // 3. Send file for download
    res.sendFile(filePath, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
      },
    });
  } catch (err) {
    console.error("Error downloading inventory invoice:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API route to generate GRN number
app.post("/api/generate-grn", async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ error: "order_id is required" });
    }

    const orderId = parseInt(order_id);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Invalid order_id" });
    }

    // Get supplier name for the order
    const orderResult = await pool.query(
      "SELECT supplier_name FROM purchase_orders WHERE id = $1",
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const supplierName = orderResult.rows[0].supplier_name;

    // Check if entry already exists for this order in grn_gen_entries
    const existingResult = await pool.query(
      "SELECT grn_number FROM grn_gen_entries WHERE purchase_order_id = $1",
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
    console.error("Error generating GRN:", err);
    res.status(500).json({ error: "Failed to generate GRN" });
  }
});
app.post("/api/generate-grn-local", async (req, res) => {
  try {
    // const { order_id } = req.body;
    // if (!order_id) {
    //   return res.status(400).json({ error: "order_id is required" });
    // }
    // console.log('order_id',order_id);

    // const orderId = parseInt(order_id);
    // if (isNaN(orderId)) {
    //   return res.status(400).json({ error: "Invalid order_id" });
    // }

    // Get supplier name for the order
    const grnResult = await pool.query(
      "SELECT generate_grn() AS grn_number")

    
    const grn=grnResult.rows[0].grn_number;
    

    res.json({ grn });
  } catch (err) {
    console.error("Error generating GRN:", err);
    res.status(500).json({ error: "Failed to generate GRN" });
  }
});

// server.js
app.get("/api/company", async (req, res) => {
  const name = req.query.name;

  if (!name) {
    return res.status(400).json({ error: "Missing 'name' query parameter" });
  }

  try {
    // Return ALL matches instead of LIMIT 1
    const query = `
      SELECT id, company_name, company_email, company_address
      FROM quotations
      WHERE company_name ILIKE $1;
    `;
    const result = await pool.query(query, [`%${name}%`]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No matches found" });
    }

    res.json(result.rows); // send all matches as an array
  } catch (error) {
    console.error("❌ Database Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get all orders for the orders management interface
app.get("/api/orders", async (req, res) => {
  const referer = req.get("referer") || "";

  // Allow only requests from your domain
  if (!referer.startsWith("https://kietprocure.com")) {
    return res.status(403).json({ error: "Access denied" });
  }

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
                created_at,
                send_date 
            FROM purchase_orders
            where assign_status='verified'
            ORDER BY created_at DESC
        `); //send date added
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all orders for MD section (All Orders tab)
app.get("/api/all-orders", async (req, res) => {
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
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get order by ID
app.get("/api/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `
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
        `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get order items by order ID
app.get("/api/orders/:id/items", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `
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
        `,
      [id]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update order details
app.put("/api/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      supplier_name,
      supplier_gst,
      supplier_address,
      payment_terms,
      expected_date,
    } = req.body;
    const { rows } = await pool.query(
      `UPDATE purchase_orders SET
             supplier_name = $1, supplier_gst = $2, supplier_address = $3, terms_of_payment = $4, date_required = $5
             WHERE id = $6 RETURNING *`,
      [
        supplier_name,
        supplier_gst,
        supplier_address,
        payment_terms,
        expected_date,
        id,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // If status is 'purchase', send email to MD about amended PO

    res.json(rows[0]);
  } catch (err) {
    console.error("Error in PUT /api/orders/:id:", err.stack || err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update order product items
app.put("/api/orders/:id/items", async (req, res) => {
  try {
    const { id } = req.params;
    const { products } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ error: "Products array is required" });
    }

    await pool.query("BEGIN");

    // Delete existing items
    await pool.query(
      "DELETE FROM purchase_order_items WHERE purchase_order_id = $1",
      [id]
    );

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
        [
          id,
          p.partNo,
          p.description,
          p.hsnCode,
          quantity,
          unitPrice,
          gst,
          discount,
          p.unit,
        ]
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
    res.status(500).json({ error: "Internal server error" });
  }
});

// Search and filter orders
app.get("/api/orders/search/filter", async (req, res) => {
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

    if (supplier && supplier !== "All Suppliers") {
      paramCount++;
      query += ` AND supplier_name = $${paramCount}`;
      params.push(supplier);
    }

    if (status && status !== "All Statuses") {
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

    if (requester && requester !== "All Requesters") {
      paramCount++;
      query += ` AND ordered_by = $${paramCount}`;
      params.push(requester);
    }

    query += " ORDER BY created_at DESC";

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get orders for inventory processing
app.get("/api/inventory-orders", async (req, res) => {
  try {
    const { rows } = await pool.query(`
            SELECT
                id,
                project_code_number as order_id,
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
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get delivery challans for inventory view
app.get("/api/delivery-challans", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        challan_no,
        challan_date,
        expiry_date,
        dc_type,
        approval_status,
        consignee_name,
        reason,
        requester
      FROM delivery_challan
      WHERE approval_status = 'approved'
      ORDER BY challan_date DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get items for a specific delivery challan
app.get("/api/delivery-challan/:id/items", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT part_no, description, hsn, quantity, unit, remarks
      FROM delivery_challan_items
      WHERE challan_id = $1
      ORDER BY id
    `, [id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST route to handle inventory form submission from Inventory.ejs
app.post("/submit-inventory", upload.single("invoice"), async (req, res) => {
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
      shift_code,
    } = req.body;

    // Validate required fields
    if (!order_id || !grn) {
      return res
        .status(400)
        .json({ success: false, error: "Order ID and GRN are required" });
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
      req.session.user.email,
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
      console.error("Error updating grn_gen_entries:", err);
      // Continue, as inventory entry succeeded
    }

    res.json({
      success: true,
      message: "Inventory entry submitted successfully",
      entry: rows[0],
    });
  } catch (error) {
    console.error("Error submitting inventory entry:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to submit inventory entry" });
  }
});

// =============================
// EXISTING ROUTES (KEEP THESE AS IS)
// =============================

// Home / Login
app.get("/", (req, res) => res.render("index.ejs", { message: "" }));

// Login submit
app.post("/submit", async (req, res) => {
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
      return res.render("index.ejs", {
        message: "Unauthorized: Incorrect role",
      });

    // Set session
    req.session.user = { id: user.id, email: user.email, role: user.role };

    // Render dashboard based on role
    switch (user.role) {
      case "Employee":
        res.render("procurement.ejs", {
          user,
          out_fl: email,
          message: "Login Successful ✅",
        });
        break;
      case "Purchase":
        res.render("Purchase.ejs", {
          user,
          out_fl: email,
          message: "Login Successful ✅",
        });
        break;
      case "Security":
        res.render("Security.ejs", {
          user,
          out_fl: email,
          message: "Login Successful ✅",
        });
        break;
      case "Inventory":
        res.render("Inventory.ejs", {
          user,
          out_fl: email,
          message: "Login Successful ✅",
        });
        break;
      case "Accounts":
        res.render("Accounts.ejs", {
          user,
          out_fl: email,
          message: "Login Successful ✅",
        });
        break;
      case "MD":
        res.render("Md.ejs", {
          user,
          out_fl: email,
          message: "Login Successful ✅",
        });
        break;
      default:
        res.render("index.ejs", { message: "Role not recognized" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing request");
  }
});

// Safe wrapper for multer
const safeUpload = (req, res, next) => {
  upload.single("quotation")(req, res, (err) => {
    if (err) {
      console.error("❌ Multer Error:", err);
      return res.status(400).json({
        success: false,
        error: "File upload failed: " + err.message,
      });
    }
    next();
  });
};

app.post("/order_raise", safeUpload, async (req, res) => {
  console.log("▶ /order_raise called");

  // 🔹 1. Session validation
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
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
    termsOfPayment,
    currency
  } = req.body;

  // 🔹 2. Build products array (since frontend sends each field as an array)
  let products = [];
  try {
    if (Array.isArray(req.body.partNo)) {
      for (let i = 0; i < req.body.partNo.length; i++) {
        products.push({
          partNo: req.body.partNo[i],
          description: req.body.description[i],
          hsn: req.body.hsn[i],
          quantity: req.body.quantity[i],
          unitPrice: req.body.unitPrice[i],
          gst: req.body.gst[i],
          unit: req.body.unit[i],
          discount: req.body.discount[i],
        });
      }
    }
  } catch (err) {
    return res.status(400).json({ success: false, error: "Invalid product fields" });
  }

  console.log("🔥 Products:", products);

  const orderedBy = req.session.user.email;
  const quotationFile = req.file ? [req.file.filename] : [];
  const contact = phone;
  const single = singleSupplier === "on";

  try {
    console.log("▶ BEGIN TRANSACTION");
    await pool.query("BEGIN");

    // 🔹 Generate PO number
    const purchaseOrderNumber = await generatePurchaseOrderNumber();

    // 🔹 Calculate total
    let totalAmount = 0;
    products.forEach((p) => {
      const unitPrice = parseFloat(p.unitPrice) || 0;
      const discount = parseFloat(p.discount) || 0;
      const quantity = parseInt(p.quantity) || 0;
      const gst = parseFloat(p.gst) || 0;

      const amount = quantity * unitPrice;
      const afterDiscount = amount - discount;
      const gstAmt = afterDiscount * (gst / 100);

      totalAmount += afterDiscount + gstAmt;
    });

    // 🔹 Insert purchase order
    const orderInsert = await pool.query(
      `INSERT INTO purchase_orders
      (project_name, project_code_number, purchase_order_number, supplier_name,
       supplier_gst, supplier_address, shipping_address, urgency, date_required,
       notes, ordered_by, quotation_file, total_amount, reference_no, contact,
       single, terms_of_payment,currency,raised_amount)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING id`,
      [
        projectName,
        projectCodeNumber,
        purchaseOrderNumber,
        supplierName,
        supplierGst,
        supplierAddress,
        shippingAddress,
        urgency,
        dateRequired,
        notes,
        orderedBy,
        quotationFile,
        totalAmount,
        reference_no,
        contact,
        single,
        termsOfPayment,
        currency,
        totalAmount

      ]
    );

    const orderId = orderInsert.rows[0].id;

    // 🔹 Insert items
    for (let p of products) {
      await pool.query(
        `INSERT INTO purchase_order_items
        (purchase_order_id, part_no, description, hsn_code, quantity,
         unit_price, gst, project_name, discount, unit)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          orderId,
          p.partNo,
          p.description,
          p.hsn,
          parseInt(p.quantity),
          parseFloat(p.unitPrice),
          parseFloat(p.gst),
          projectName,
          parseFloat(p.discount),
          p.unit,
        ]
      );
    }

    await pool.query("COMMIT");
    console.log("✔ DB Transaction committed");
    const result3=await pool.query(`select remaining_budget from project_info where project_code=$1`,[projectCodeNumber]);
    const remain_b=result3.rows[0].remaining_budget;
    const calc=remain_b-totalAmount;
    const result4=await pool.query(`update project_info  set remaining_budget=$1 where project_code=$2`,[calc,projectCodeNumber]);
    
    
    console.log("result rows",result3.rows[0])



    // 🔹 Send email
    

    // 🔹 Final response
    return res.json({ success: true, message: "✅ Order submitted successfully" });



  } catch (err) {
    console.error("❌ ERROR:", err);
    await pool.query("ROLLBACK").catch(() => {});
    return res.status(500).json({
      success: false,
      error: "Failed to raise purchase order",
      detail: err.message,
    });
  }
});


// 🔹 Global error handler (keeps JSON output always)
app.use((err, req, res, next) => {
  console.error("🔥 Global Error Handler:", err);
  if (res.headersSent) {
    return next(err);
  }
  res
    .status(500)
    .json({ success: false, error: err.message || "Internal Server Error" });
});

// Logout

app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send("Could not log out");
    res.clearCookie("connect.sid"); // important
    res.redirect(303, "/"); // safer after POST
  });
});


// Forgot password
app.get("/forgot", (req, res) =>
  res.sendFile(path.join(__dirname, "public/forgot.html"))
);

// Success page route
app.get("/success-page", (req, res) =>
  res.sendFile(path.join(__dirname, "public/sucess_.html"))
);

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (!result.rows.length)
      return res.status(404).send("Email not registered");

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 3600000);

    await pool.query(
      "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3",
      [token, expiry, email]
    );

    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: "No-reply@kietsindia.com",
        pass: "process.env.NO_PASSWORD",
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

    res.sendFile(path.join(__dirname, "public/sucess.html"));
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

app.get("/api/account-details", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
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
      WHERE po.status IN ( 'inventory_processed', 'sent' )
    `;
    let params = [];
    let paramCount = 0;

    // If po_number is provided, filter by it
    if (
      req.query.po_number &&
      typeof req.query.po_number === "string" &&
      req.query.po_number.trim() &&
      req.query.po_number !== "[object Event]"
    ) {
      paramCount++;
      query += ` AND po.purchase_order_number = $${paramCount}`;
      params.push(req.query.po_number.trim());
    }

    // If the user role is not 'Accounts', restrict results to orders placed by the logged-in user
    if (req.session.user.role !== "Accounts") {
      paramCount++;
      query += ` AND po.ordered_by = $${paramCount}`;
      params.push(req.session.user.email);
    }

    // Order the results by creation date, descending
    query += " ORDER BY po.created_at DESC";

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res.json({ message: "No payment details found" });
    }

    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching account details:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

//newly added for sending mail in account.ejs

app.post("/api/send-email/:id", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const { id } = req.params;

    // Fetch order details
    const orderResult = await pool.query(
      "SELECT ordered_by, po_number FROM purchase_orders WHERE id = $1",
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { ordered_by, po_number } = orderResult.rows[0];

    // Send email
    const transporte = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: "No-reply@kietsindia.com",
        pass: "process.env.NO_PASSWORD",
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

    await transporte.sendMail({
      to: ordered_by,
      from: "No-reply@kietsindia.com",
      subject: mailSubject,
      html: mailBody,
    });

    res.json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email" });
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
            total_amount AS "totalAmount",
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
app.put(
  "/api/orders/:id/quotation",
  upload.single("quotation"),
  async (req, res) => {
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
  }
);

app.post(
  "/api/orders/:id/quotations",
  upload.array("quotations"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // filenames of uploaded files
      const newFiles = req.files.map((file) => file.filename);

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
      res
        .status(500)
        .json({ success: false, error: "Failed to upload quotations" });
    }
  }
);

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
        pass: "process.env.NO_PASSWORD",
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const mailOptions = {
      from: "No-reply@kietsindia.com",
      to: "chandrashekaraiah.r@kietsindia.com",
      subject: `Action Required: Final Approval Needed for Order ${rows[0].purchase_order_number}`,
   
  html: `
   
     
    <div style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 10px;">

  <div style="max-width: 620px; margin: auto; background: #ffffff; padding: 10px 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">

    <p style="font-size: 15px; color: #333; line-height: 1.7;"><strong>Dear MD Sir,</strong></p>

    <p style="font-size: 15px; color: #444; line-height: 1.5;" >
      We wish to notify you that a new Purchase Order has been prepared and is now awaiting your Final approval.<br>
      Please find the summary details below for your reference:
    </p>

    <table cellpadding="10" cellspacing="0" 
       style="margin: 18px 0; font-size: 14px; border-collapse: collapse; width: 100%; background: #fafafa; border-radius: 6px; border: 1px solid #ccc;">

      <tr>
        <td style="border-bottom: 1px solid #e6e6e6; width: 40%;"><strong>Order Number:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${rows[0].purchase_order_number}</td>
      </tr>
    
      <tr>
        <td style="border-bottom: 1px solid #e6e6e6;"><strong>Supplier Name:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${rows[0].supplier_name || "N/A"}</td>
      </tr>
      <tr>
        <td style="border-bottom: 1px solid #e6e6e6;"><strong>Submitted By:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${rows[0].ordered_by || "N/A"}</td>
      </tr>
       <tr>
        <td style="border-bottom: 1px solid #e6e6e6;"><strong>Total Amount:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">₹${rows[0].total_amount || "N/A"}</td>
      </tr>

      <tr>
        <td><strong>Submission Date:</strong></td>
        <td>${rows[0].order_date || new Date().toLocaleDateString()}</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://kietprocure.com/"
        style="background: #0056b3; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block;">
        Review Purchase Order
      </a>
    </div>
  

    
  
  <div style="text-align: center; padding: 20px; border-top: 1px solid #ddd;">
      <img src="cid:logoImage" alt="Company Logo"
        style="width: 90px; height: auto; margin-bottom: 10px;" />

      <div style="font-size: 16px; font-weight: bold; color: #000;">
        KIET TECHNOLOGIES PVT LTD
      </div>

      <div style="font-size: 13px; margin-top: 5px;">
        📍 51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru, Karnataka 560111
      </div>

      <div style="font-size: 13px; margin-top: 5px;">
        📞 +91 98866 30491 &nbsp;|&nbsp; ✉️ info@kietsindia.com &nbsp;|&nbsp;
        🌐 <a href="https://kietsindia.com" style="color:#0066cc; text-decoration:none;">kietsindia.com</a>
      </div>

      <!-- Social Icons -->
      <div style="margin-top: 12px;">
        <a href="https://facebook.com" style="margin: 0 6px;">
          <img src="cid:fbIcon" width="22" />
        </a>
        <a href="https://linkedin.com/company" style="margin: 0 6px;">
          <img src="cid:lkIcon" width="22" />
        </a>
        <a href="https://instagram.com" style="margin: 0 6px;">
          <img src="cid:igIcon" width="22" />
        </a>
        <a href="https://kietsindia.com" style="margin: 0 6px;">
          <img src="cid:webIcon" width="22" />
        </a>
      </div>

      <div style="font-size: 11px; color: #777; margin-top: 15px;">
        © 2025 KIET TECHNOLOGIES PVT LTD — All Rights Reserved.
      </div>
    </div>
  </div>























</div>



    </div>
</div>


    

   
    
  `,
      attachments: [
        {
          filename: "lg.jpg", // your image file name
          path: "public/images/lg.jpg", // local path to the image
          cid: "logoImage", // same cid as in <img src="cid:logoImage">
        },
      ],
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

app.put("/api/orders/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["approved", "rejected", "paid"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const { rows } = await pool.query(
      "UPDATE purchase_orders SET status=$1 WHERE id=$2 RETURNING *",
      [status, id]
    );

    if (!rows.length) return res.status(404).json({ error: "Order not found" });

    const order = rows[0];

    // Send email if status is approved
    if (status === "approved") {
      const transporte = nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: false, // STARTTLS
        auth: {
          user: "No-reply@kietsindia.com",
          pass: "process.env.NO_PASSWORD",
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const mailOptions = {
        from: "No-reply@kietsindia.com",
        to: "purchase@kietsindia.com",
        subject: `Order Approved: ${order.purchase_order_number}`,
        text: `
Hello Purchase Team,

The order ${order.purchase_order_number} has been approved by MD.

📌 Order Details:
- Order Number: ${order.purchase_order_number}
- Project: ${order.project_name}
- Supplier: ${order.supplier_name}
- Requester: ${order.ordered_by}
- Total Amount: ₹${order.total_amount}
- Status: Approved

Please proceed with the next steps.

Best regards,
MD Approval System
KIET TECHNOLOGIES PVT LTD,
        `,
        attachments: [
          {
            filename: "lg.jpg",
            path: "public/images/lg.jpg",
            cid: "logoImage",
          },
        ],
      };

      try {
        const info = await transporte.sendMail(mailOptions);
        console.log("✅ Email sent to purchase@kietsindia.com:", info.response);
      } catch (err) {
        console.error("❌ Email failed:", err);
      }
    }

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
      "UPDATE purchase_orders SET status='sent', send_date=NOW() WHERE id=$1 RETURNING *",
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
        pass: "process.env.NO_PASSWORD",
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
          cid: "logoImage",
        },
      ],
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
    console.error("Error inserting into grn_gen_entries:", err);
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
    const {
      page = 1,
      limit = 10,
      sortBy = "created_at",
      sortOrder = "DESC",
      search,
      supplier,
      status,
      dateFrom,
      dateTo,
    } = req.query;

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

    if (supplier && supplier !== "All Suppliers") {
      paramCount++;
      query += ` AND supplier_name = $${paramCount}`;
      params.push(supplier);
    }

    if (status && status !== "All Statuses") {
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
        pages: Math.ceil(total / limit),
      },
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

    const items = itemsResult.rows.map((row) => ({
      part_no: row.part_no,
      description: row.description,
      hsn_code: row.hsn_code,
      gst: row.gst,
      quantity: row.quantity,
      unit: row.unit || "pcs",
      unit_price: Number(row.unit_price) || 0,
      discount: row.discount || 0,
    }));

    // 2️⃣ Prepare poData object
    const poData = {
      supplier: {
        name: order.supplier_name,
        address: order.supplier_address,
        contact: order.contact || "N/A",
        gst: order.supplier_gst || "N/A",
      },
      poNumber: order.po_number || "UNKNOWN",
      reference_no: order.reference_no,
      date: new Date(order.created_at).toLocaleDateString(),
      expected_date: order.date_required
        ? new Date(order.date_required).toLocaleDateString()
        : "N/A",
      delivery_through: order.delevery_by,
      projectcode: order.project_code_number,

      requester: {
        name: order.ordered_by,
        plant: "Aaryan Tech Park", // fixed or from DB
        email: order.ordered_by_email || "example@mail.com",
      },
      currency:order.currency || "INR",

      shipTo: order.shipping_address,
      invoiceTo: `KIET TECHNOLOGIES PVT.LTD, 51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560078
      CIN: U29253KA2014PTC076845
      GSTIN: 29AAFCK6528D1ZG`,
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
      line: "public/images/line.png",
    };

    // 3️⃣ Generate unique filename
    const timestamp = Date.now();
    const fileName = `PO_${order.po_number}_${timestamp}.pdf`;
    const filePath = path.join(uploadsDir, fileName);

    // 4️⃣ Generate PDF
    generatePurchaseOrder(poData, filePath);

    // 5️⃣ Send PDF as response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    

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
        res
          .status(500)
          .json({ error: "PDF generation failed - file not found" });
      }
    }, 1000); // Wait 1 second for PDF generation
  } catch (err) {
    console.error("❌ Error generating PDF:", err.stack || err);
    res.status(500).json({ error: err.message || "Failed to generate PDF" });
  }
});

app.get("/api/dc/:id/pdf", async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Fetch delivery challan details from DB
    const dcResult = await pool.query(
      "SELECT * FROM delivery_challan WHERE id = $1",
      [id]
    );

    if (dcResult.rows.length === 0) {
      return res.status(404).json({ error: "Delivery Challan not found" });
    }
    const dc = dcResult.rows[0];

    // Fetch delivery challan items
    const itemsResult = await pool.query(
      "SELECT * FROM delivery_challan_items WHERE challan_id = $1 ORDER BY id",
      [id]
    );

    const items = itemsResult.rows.map((row) => ({
      part_no: row.part_no,
      description: row.description,
      hsn: row.hsn,
      quantity: row.quantity,
      unit: row.unit || "pcs",
      remarks: row.remarks,
    }));

    // 2️⃣ Prepare dcData object
    const dcData = {
      challanNo: dc.challan_no,
      challanDate: new Date(dc.challan_date).toLocaleDateString(),
      deliveryDate: dc.delivery_date ? new Date(dc.delivery_date).toLocaleDateString() : "N/A",
      vehicleNo: dc.vehicle_no,
      consignor: {
        name: dc.consignor_name,
        address: dc.consignor_address,
        gst: dc.consignor_gst,
      },
      consignee: {
        name: dc.consignee_name,
        address: dc.consignee_address,
        gst: dc.consignee_gst,
        contact: dc.consignee_contact,
        phone: dc.consignee_phone,
      },
      reason: dc.reason,
      items: items, // from DB query delivery_challan_items
      type:dc.dc_type,

      signPath: "public/images/signature.png",
      company: { logo: "public/images/lg.jpg" },
      line: "public/images/line.png",
    };

    // 3️⃣ Generate unique filename
    const timestamp = Date.now();
    const fileName = `DC_${dc.challan_no}_${timestamp}.pdf`;
    const filePath = path.join(uploadsDir, fileName);

    // 4️⃣ Generate PDF
    generateDeliveryChallan(dcData, filePath);

    // 5️⃣ Send PDF as response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    // Wait a bit for PDF generation to complete, then send file
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath, (err) => {
          if (err) {
            console.error("Error sending DC PDF:", err);
            res.status(500).json({ error: "Failed to send DC PDF" });
          } else {
            // Optionally delete the file after sending
            // fs.unlinkSync(filePath);
          }
        });
      } else {
        res
          .status(500)
          .json({ error: "DC PDF generation failed - file not found" });
      }
    }, 1000); // Wait 1 second for PDF generation
  } catch (err) {
    console.error("❌ Error generating DC PDF:", err.stack || err);
    res.status(500).json({ error: err.message || "Failed to generate DC PDF" });
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
    const items = itemsResult.rows.map((row) => ({
      part_no: row.part_no,
      description: row.description,
      hsn_code: row.hsn_code,
      gst: row.gst,
      quantity: row.quantity,
      unit: row.unit || "pcs",
      unit_price: Number(row.unit_price) || 0,
      discount: row.discount || 0,
    }));

    // Prepare poData object (using same as PO for now)
    const poData = {
      supplier: {
        name: order.supplier_name,
        address: order.supplier_address,
        contact: order.contact || "N/A",
        gst: order.supplier_gst || "N/A",
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
      invoiceTo:
        "KIET TECHNOLOGIES PVT.LTD ,51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111",
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
      line: "public/images/line.png",
    };

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `Invoice_${poNumber}_${timestamp}.pdf`;
    const filePath = path.join(uploadsDir, fileName);

    // Generate PDF (using PO generator for now)
    generatePurchaseOrder(poData, filePath);

    // Send PDF as response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

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
        res
          .status(500)
          .json({ error: "Invoice PDF generation failed - file not found" });
      }
    }, 1000); // Wait 1 second for PDF generation
  } catch (err) {
    console.error("❌ Error generating invoice PDF:", err.stack || err);
    res
      .status(500)
      .json({ error: err.message || "Failed to generate invoice PDF" });
  }
});

app.post(
  "/generate-quotation",
  upload.array("attachments[]"),
  async (req, res) => {
    const formData = req.body || {};
    // console.log('Form Data Received:', formData);

    const quotationType = formData.quotationType || "Trade"; // Default to Trade if not specified
    console.log(formData);

    // Normalize form data to arrays with null checks
    const itemDescriptions =
      (formData && formData["itemDescription[]"]) ||
      (formData && formData.itemDescription) ||
      [];
    let itemQuantities, itemPrices, itemPartNos, itemHSNs, itemUnits;

    if (quotationType !== "VK") {
      itemQuantities =
        (formData && formData["itemQuantity[]"]) ||
        (formData && formData.itemQuantity) ||
        [];
      itemPrices =
        (formData && formData["itemPrice[]"]) ||
        (formData && formData.itemPrice) ||
        [];

      itemPartNos =
        (formData && formData["itemPartNo[]"]) ||
        (formData && formData.itemPartNo) ||
        [];
      itemHSNs =
        (formData && formData["itemHSN[]"]) ||
        (formData && formData.itemHSN) ||
        [];
      itemUnits =
        (formData && formData["itemUnit[]"]) ||
        (formData && formData.itemUnit) ||
        [];

      // Calculate totals
      let subtotal = 0;
      const items = [];
      itemDescriptions.forEach((desc, index) => {
        const quantity = parseFloat(itemQuantities[index]) || 0;
        const price = parseFloat(itemPrices[index]) || 0;

        subtotal += quantity * price;

        items.push({
          part_no: itemPartNos[index] || "",
          description: desc,
          hsn_code: itemHSNs[index] || "",
          quantity: quantity,
          unit: itemUnits[index] || "Nos",
          unit_price: price,
        });
      });

      const total = subtotal;

      // Handle attachments
      // const attachments = [];
      // if (req.files && req.files.length > 0) {
      //   const attachmentNotes = Array.isArray(formData.attachmentNotes)
      //     ? formData.attachmentNotes
      //     : [formData.attachmentNotes || ""];
      //   req.files.forEach((file, index) => {
      //     attachments.push({
      //       filename: file.originalname,
      //       path: file.path,
      //       notes: attachmentNotes[index] || "",
      //     });
      //   });
      // }

      // Prepare data for PDF (adapted for quotation)
      const poData = {
        company: {
          logo: path.join(__dirname, "public", "images", "page_logo.jpg"),
          name: formData.companyName || "",
          email: formData.companyEmail || "",
          gst: formData.companyGST || "",
          address: formData.companyAddress || "",
        },
        supplier: {
          address: formData.clientAddress || "",
          contact: formData.clientPhone || "",
          // Assuming GST is provided,
          total: total.toFixed(2),
          duration: formData.deliveryDuration || "",
        },
        clientEmail: formData.clientEmail || "",
        shipTo: formData.clientAddress || "",
        invoiceTo: formData.clientAddress || "",
        poNumber: formData.quotationNumber || "",
        date: formData.quotationDate || "",
        projectcode: formData.projectCode || "",
        requester: {
          name: formData.clientName || "",
        },
        reference_no: formData.referenceNo || "",
        goodsRecipient: formData.goodsRecipient || "",
        expected_date: formData.validUntil || "",
        termsOfPayment: formData.paymentTerms || "",
        items: items,
        gstterms: formData.gst || "Extra 18%",
        insurance: formData.insurance || "N/A",
        deliveyt: formData.deliveryTerms || "Ex-Works/DAP",
        package: formData.packaging || "Standard Export Packaging extra",

        currency: formData.currency || "",
        line: path.join(__dirname, "public", "images", "line.png"),
        signPath: path.join(__dirname, "public", "images", "signature.png"),
      };
      const sanitizedNumber = (formData.quotationNumber || "temp").replace(
        /[^a-zA-Z0-9.-]/g,
        "_"
      );
      const filePath = path.join(
        qtUploadsDir,
        `quotation_${sanitizedNumber}.pdf`
      );

      generateQuotation(poData, filePath);
      setTimeout(() => {
        res.download(filePath, `quotation_${sanitizedNumber}.pdf`, (err) => {
          if (err) {
            console.error("Error downloading PDF:", err);
            res.status(500).send("Error generating PDF");
          }
        });
      }, 1000);
    } else if (quotationType === "VK") {
      const client = await pool.connect();

      try {
        // ==============================================================
        // 1️⃣ Generate unique quotation number
        // ==============================================================

        // ==============================================================
        // 2️⃣ Extract and sanitize form data
        // ==============================================================
        const formData = req.body || " ";
        console.log(formData);
        const quotationNumber = formData.quotationNumber;

        // Process PV Wiring Adaptor Details and KIET Costs
        let pvAdaptors = [];
        let kietCosts = [];
        console.log(formData["itemDescription"]);

        if (
          formData["itemDescription"] &&
          Array.isArray(formData["itemDescription"])
        ) {
          formData["itemDescription"].forEach((desc, index) => {
            const cost = parseFloat(formData["priceInput"][index]) || 0;
            const qty = parseFloat(formData["qtyInput"][index]) || 0;

            kietCosts.push({
              description: desc,
              cost: cost,
              qty: qty,
              totalValue: (cost * qty).toFixed(2),
            });
          });

          // 🧾 Calculate total for user inputs
          const kietTotal = kietCosts
            .reduce((sum, item) => sum + parseFloat(item.totalValue), 0)
            .toFixed(2);

          // ➕ Add total row (colspan-ready)
          kietCosts.push({
            description: `Total costs in ${
              formData.currency || "INR"
            } (qty of 1 No.)`,
            cost: kietTotal,
            qty: 1,
            totalValue: kietTotal,
            colSpan: 3, // 👈 for PDF/HTML table formatting
            isSummaryRow: true,
          });

          // ➕ Add additional fixed rows
          const priceInputs = formData["priceInput"] || [];

          kietCosts.push({
            description: "Export packaging charges included",
            cost: priceInputs[4] || "2650",
            qty: "",
            totalValue: priceInputs[4] || "2650",
            colSpan: 3, // 👈 merge first 3 columns
            isSummaryRow: true,
          });

          kietCosts.push({
            description: "Bigger box setup",
            cost: priceInputs[5] || "",
            qty: "",
            totalValue: priceInputs[5] || "",
            colSpan: 3,
            isSummaryRow: true,
          });

          const a = Number(priceInputs[5] || 0);
          const b = Number(priceInputs[4] || 0);
          const c = Number(kietTotal || 0);

          const total = a + b + c;
          let total1 = (total * 1).toLocaleString();
          const totalFormatted = total.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });

          console.log("Total_hjkjkjkjk:", total1, totalFormatted); // e.g., "15,900"

          kietCosts.push({
            description: "Total Cost",
            cost: total || " ",
            qty: "",
            totalValue: total || "",

            colSpan: 3,
            isSummaryRow: true,
          });

          console.log(kietCosts);
        } else {
          console.log("no pv data");
        }

        if (formData["pvQty"] && Array.isArray(formData["pvQty"])) {
          formData["pvQty"].forEach((qty, index) => {
            pvAdaptors.push({
              slNo: index + 1,
              qty: parseFloat(qty) || 0,
              familyName: formData["pvFamilyName"][index] || "",
              revNo: formData["pvRevNo"][index] || "",
              coaxialPin: formData["pvCoaxialPin"][index] || "",
              sokCard: formData["pvSokCard"][index] || "",
              sokQty: parseFloat(formData["pvSokQty"][index]) || 0,
              rate: parseFloat(formData["pvRate"][index]) || 0,
              totalAmount: (
                parseFloat(qty) * parseFloat(formData["pvRate"][index] || 0)
              ).toFixed(2),
            });
          });
        }

        // Parse PV adaptors data (this is the main data for VK quotations)

        console.log("🔧 Parsed PV Adaptors:", pvAdaptors);
        console.log(`📦 PV Adaptors Count: ${pvAdaptors.length}`);
        console.log(`💰 KIET Costs Count: ${kietCosts.length}`);

        // Extract form data fields
        const {
          quotationDate,
          referenceNo,
          validUntil,
          currency,
          paymentTerms,
          deliveryDuration,
          companyName,
          companyEmail,
          companyGST,
          companyAddress,
          clientName,
          clientEmail,
          clientPhone,
          notes,
        } = req.body;

        // ==============================================================
        // 4️⃣ Calculate total amount
        // ==============================================================
        const totalAmount = pvAdaptors.reduce((sum, item) => {
          const qty = parseFloat(item.qty) || 0;
          const rate = parseFloat(item.rate) || 0;
          return sum + qty * rate;
        }, 0);

        console.log("✅ Total amount:", totalAmount);

        // ==============================================================
        // 5️⃣ Prepare values for insertion
        // ==============================================================
        const defaultValidUntil =
          validUntil ||
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

        const quotationValues = [
          "VK", // quotation_type
          quotationNumber,
          quotationDate || new Date().toISOString().split("T")[0],
          referenceNo || null,
          defaultValidUntil,
          currency || "INR",
          paymentTerms || null,
          deliveryDuration || null,
          companyName || null,
          companyEmail || null,
          companyGST || null,
          companyAddress || null,
          clientName || null,
          clientEmail || null,
          clientPhone || null,
          totalAmount,
          notes || null,
          "approved", // default status
          req.session?.user?.email || null, // created_by
          JSON.stringify(kietCosts),
          JSON.stringify(pvAdaptors),
        ];

        // ==============================================================
        // 6️⃣ Insert into database
        // ==============================================================
        const insertQuery = `
      INSERT INTO vk_quotations (
        quotation_type, quotation_number, quotation_date, reference_no,
        valid_until, currency, payment_terms, delivery_duration,
        company_name, company_email, company_gst, company_address,
        client_name, client_email, client_phone,
        total_amount, notes, status, created_by, kiet_costs, pv_adaptors
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      RETURNING id
    `;

        const { rows: inserted } = await client.query(
          insertQuery,
          quotationValues
        );
        const quotationId = inserted[0].id;

        console.log("🆔 VK Quotation inserted with ID:", quotationId);

        // ==============================================================
        // 7️⃣ Prepare PDF data
        // ==============================================================
        const poData = {
          company: {
            logo: path.join(__dirname, "public/images/page_logo.jpg"),
            name: companyName || "",
            email: companyEmail || "",
            gst: companyGST || "",
            address: companyAddress || "",
          },
          supplier: {
            address: req.body.clientAddress || "",
            contact: clientPhone || "",
            duration: deliveryDuration || "",
          },
          clientEmail,
          poNumber: quotationNumber || "",
          date: quotationDate || "",
          requester: { name: clientName || "" },
          reference_no: referenceNo || "",
          expected_date: validUntil || "",
          termsOfPayment: paymentTerms || "",
          gstterms: formData.gst || "Extra 18%",
          insurance: formData.insurance || "N/A",
          deliveyt: formData.deliveryTerms,
          package: formData.packaging,
          currency: currency || "INR",
          kietCosts,
          pvAdaptors,
          line: path.join(__dirname, "public/images/line.png"),
          signPath: path.join(__dirname, "public/images/signature.png"),
        };

        const sanitizedNumber = (quotationNumber || "temp").replace(
          /[^a-zA-Z0-9.-]/g,
          "_"
        );
        const filePath = path.join(
          qtUploadsDir,
          `quotation_${sanitizedNumber}.pdf`
        );

        await generateVKQuotation(poData, filePath);

        // ==============================================================
        // 8️⃣ Send generated PDF to client
        // ==============================================================
        res.download(filePath, `quotation_${sanitizedNumber}.pdf`, (err) => {
          if (err) {
            console.error("❌ Error sending VK PDF:", err);
            res.status(500).send("Error generating VK quotation PDF");
          }
        });
      } catch (error) {
        console.error("🚨 VK quotation error:", error);
        res.status(500).json({ error: "Failed to generate VK quotation" });
      } finally {
        client.release();
      }
    }
  }
);

const quotationStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "uploads", "quotations");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const quotationUpload = multer({
  storage: quotationStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|jpg|jpeg|png|txt/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

// purchaseOrder.js

// Get approved quotations for procurement users
app.get("/approved-quotations", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    // Fetch approved regular quotations created by the logged-in user
    const regularResult = await pool.query(
      `SELECT
        q.id,
        q.quotation_number as quotationnumber,
        q.client_name as clientname,
        q.company_name as companyname,
        COALESCE(q.quotation_date::text, 'N/A' ) as quotationdate,
        COALESCE(q.valid_until::text, 'N/A') as validuntil,
        COALESCE(q.currency, 'INR') as currency,
        COALESCE(q.payment_terms, 'N/A') as paymentterms,
        COALESCE(q.delivery_duration, 'N/A') as deliveryduration,
        COALESCE(q.total_amount) as totalamount,
        q.status,
        q.created_at,
        'regular' as quotation_type
      FROM quotations q
      LEFT JOIN quotation_items qi ON q.id = qi.quotation_id
      WHERE q.status = 'approved' AND q.created_by = $1
      GROUP BY q.id
      ORDER BY q.created_at DESC`,
      [req.session.user.email]
    );

    // Fetch approved VK quotations created by the logged-in user
    const vkResult = await pool.query(
      `SELECT
        vq.id,
        vq.quotation_number as quotationnumber,
        vq.client_name as clientname,
        vq.company_name as companyname,
        vq.quotation_date as quotationdate,
        COALESCE(vq.valid_until::text, 'N/A') as validuntil,
        COALESCE(vq.currency, 'INR') as currency,
        COALESCE(vq.payment_terms, 'N/A') as paymentterms,
        COALESCE(vq.delivery_duration, 'N/A') as deliveryduration,
        COALESCE(vq.total_amount, 0) as totalamount,
        vq.status,
        vq.created_at,
        'vk' as quotation_type
      FROM vk_quotations vq
      WHERE vq.status = 'approved' AND vq.created_by = $1
      ORDER BY vq.created_at DESC`,
      [req.session.user.email]
    );

    // Combine results
    const allQuotations = [...regularResult.rows, ...vkResult.rows];
    console.log("vk quotations", vkResult.rows);
    res.json(allQuotations);
    console.log(
      "✅ Fetched approved quotations for procurement:",
      allQuotations
    );
  } catch (err) {
    console.error("❌ Error fetching approved quotations:", err);
    res.status(500).json({ error: "Failed to fetch approved quotations" });
  }
});

app.get("/download-quotation/:param", async (req, res) => {
  try {
    const { param } = req.params;

    const isNumeric = /^\d+$/.test(param);

    const quotationResult = await pool.query(
      `SELECT * FROM quotations WHERE ${
        isNumeric ? "id" : "quotation_number"
      } = $1 LIMIT 1`,
      [param]
    );

    if (quotationResult.rows.length === 0) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    const quotation = quotationResult.rows[0];
    console.log("quotation format consolw", quotation);

    // =======================================================
    //  FETCH ITEMS FROM quotation_items TABLE
    // =======================================================
    const itemsQuery = `
      SELECT 
        part_no,
        description,
        hsn_code,
        quantity,
        unit,
        unit_price,
        total_amount
      FROM quotation_items
      WHERE quotation_id = $1
      ORDER BY id ASC
    `;

    const itemsResult = await pool.query(itemsQuery, [quotation.id]);
    const items = itemsResult.rows || [];

    console.log("Fetched items:", items);
    console.log("quotation items :", quotation);

    // =======================================================
    //  BUILD poData WITH DATABASE ITEMS
    // =======================================================
    const poData = {
      poNumber: quotation.quotation_number,
      date: quotation.quotation_date.toLocaleDateString("en-GB"),
      expected_date: quotation.valid_until.toLocaleDateString("en-GB"),
      termsOfPayment: quotation.payment_terms || "",
      currency: quotation.currency || "INR",
      requester: {
        name: quotation.client_name || "",
      },
      reference_no: quotation.reference_no,
      company: {
        name: quotation.company_name || "",
        email: quotation.company_email || "",
        gst: quotation.company_gst || "",
        address:
          quotation.company_address ||
          " ",
        logo: path.join(process.cwd(), "public", "images", "page_logo.jpg"),
      },
      supplier: {
        name: quotation.client_name,
        address: quotation.client_address || "",
        duration: quotation.delivery_duration || "",
        contact: quotation.client_phone || "",
      },
      gstterms: quotation.gst || "Extra 18%",
      insurance: quotation.insurance || "N/A",
      deliveyt: quotation.deliveryTerms || "Ex-Works/DAP",
      package: quotation.packaging || "Standard Export Packaging extra",
      currency: quotation.currency || "",
      line: path.join(__dirname, "public", "images", "line.png"),
      signPath: path.join(__dirname, "public", "images", "signature.png"),
      items: items, // <-- NOW ITEMS COME FROM THE TABLE
    };

    console.log("quotation poData:", poData);
    

    // =======================================================
    //  GENERATE PDF
    // =======================================================
    const fileName = `quotation_${
      poData.poNumber
    }_${Date.now()}.pdf`;
    const filePath = path.join(qtUploadsDir, fileName);

    console.log("📄 Generating PDF:", filePath);
    console.log('quotation poData items:',fileName)

    await generateQuotation(poData, filePath);

    console.log("✅ PDF successfully generated, preparing download...");
    res.setHeader("file-Name", fileName);
    // res.setHeader("file-Name", fileName);
    return res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("❌ Error downloading file:", err);
        res.status(500).send("Error delivering the file");
      }
    });
  } catch (error) {
    console.error("❌ Error fetching quotation:", error);
    return res.status(500).json({ error: error.message });
  }
});

// purchaseOrder.js

app.get("/api/generate-quotation-number", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT generate_quotation_number() as quotation_number"
    );

    const quotationNumber = result.rows[0].quotation_number;

    client.release();

    res.json({ quotationNumber });
  } catch (error) {
    console.error("Error generating quotation number:", error);
    res.status(500).json({ error: "Failed to generate quotation number" });
  }
});

// Save quotation API
app.post(
  "/api/save-quotation",
  quotationUpload.array("attachments[]"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Extract form data
      const {
        quotationType,
        quotationNumber,
        quotationDate,
        referenceNo,
        validUntil,
        currency,
        paymentTerms,
        deliveryDuration,
        companyName,
        companyEmail,
        companyGST,
        companyAddress,
        clientName,
        clientEmail,
        clientPhone,
        clientCompany,
        clientAddress,
        taxRate,
        discountRate,
        notes,
        items,
      } = req.body;

      // Parse items JSON
      const itemsData = JSON.parse(items);

      // Insert quotation
      const quotationQuery = `
            INSERT INTO quotations (
                quotation_type, quotation_number, quotation_date, reference_no,
                valid_until, currency, payment_terms, delivery_duration,
                company_name, company_email, company_gst, company_address,
                client_name, client_email, client_phone, client_company, client_address,
                tax_rate, discount_rate, total_amount, notes, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            RETURNING id
        `;

      const quotationValues = [
        quotationType,
        quotationNumber,
        quotationDate,
        referenceNo,
        validUntil,
        currency,
        paymentTerms,
        deliveryDuration,
        companyName,
        companyEmail,
        companyGST,
        companyAddress,
        clientName,
        clientEmail,
        clientPhone,
        clientCompany,
        clientAddress,
        parseFloat(taxRate) || 18,
        parseFloat(discountRate) || 0,
        totalAmount,
        notes,
        "draft",
      ];

      const quotationResult = await client.query(
        quotationQuery,
        quotationValues
      );
      const quotationId = quotationResult.rows[0].id;
      console.log("Quotation inserted with ID:", quotationId);

      // Insert items
      console.log("Inserting items...");
      for (let i = 0; i < itemsData.length; i++) {
        const item = itemsData[i];
        console.log(`Inserting item ${i + 1}:`, item);

        const itemQuery = `
                INSERT INTO quotation_items (
                    quotation_id, part_no, description, hsn_code, gst_rate,
                    quantity, unit, unit_price, discount, total_amount
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `;

        const itemValues = [
          quotationId,
          item.partNo || "",
          item.description || "",
          item.hsn || "",
          parseFloat(item.gst) || 18,
          parseFloat(item.quantity) || 0,
          item.unit || "Nos",
          parseFloat(item.unitPrice) || 0,
          parseFloat(item.discount) || 0,
          parseFloat(item.total) || 0,
        ];

        await client.query(itemQuery, itemValues);
      }
      console.log("All items inserted successfully");

      // Insert attachments
      console.log("Processing attachments...");
      if (req.files && req.files.length > 0) {
        console.log(`Found ${req.files.length} attachments`);
        const attachmentNotes = req.body.attachmentNotes || [];

        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          console.log(`Processing attachment ${i + 1}:`, file.originalname);

          const attachmentQuery = `
                    INSERT INTO quotation_attachments (
                        quotation_id, file_name, original_name, file_path,
                        file_size, mime_type, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                `;

          const attachmentValues = [
            quotationId,
            file.filename,
            file.originalname,
            file.path,
            file.size,
            file.mimetype,
            attachmentNotes[i] || "",
          ];

          await client.query(attachmentQuery, attachmentValues);
        }
        console.log("All attachments inserted");
      } else {
        console.log("No attachments to process");
      }

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Quotation saved successfully",
        quotationNumber: quotationNumber,
        quotationId: quotationId,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving quotation:", error);
      res.status(500).json({
        success: false,
        error: "Failed to save quotation",
        details: error.message,
      });
    } finally {
      client.release();
    }
  }
);

// Generate quotation PDF
// app.post(
//   "/generate-quotation",
//   quotationUpload.array("attachments[]"),
//   async (req, res) => {
//     console.log("Generate Quotation Request Body:", req.body);
//     try {
//       const saveResponse = await fetch(
//         `${req.protocol}://${req.get("host")}/api/save-quotation`,
//         {
//           method: "POST",
//           body: req.body,
//           headers: req.headers,
//         }
//       );

//       if (!saveResponse.ok) {
//         throw new Error("Failed to save quotation before generating PDF");
//       }

//       const saveResult = await saveResponse.json();

//       const poData = {
//         poNumber: req.body.quotationNumber,
//         date: req.body.quotationDate,
//         expected_date: req.body.validUntil,
//         termsOfPayment: req.body.paymentTerms,
//         currency: req.body.currency,
//         company: {
//           name: req.body.companyName || "KIET TECHNOLOGIES PRIVATE LIMITED",
//           email: req.body.companyEmail || "info@kiet.com",
//           gst: req.body.companyGST || "29AAFCK6528DIZG",
//           address:
//             req.body.companyAddress ||
//             "51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111",
//           logo: "./public/images/page_logo.jpg",
//         },
//         supplier: {
//           name: req.body.clientName,
//           address: req.body.clientAddress,
//           duration: req.body.deliveryDuration,
//         },
//         shipTo: req.body.clientAddress,
//         reference_no: req.body.referenceNo,
//         requester: {
//           name: req.body.clientName,
//         },
//         items: JSON.parse(req.body.items || "[]"),
//         line: "./public/images/line.png",
//         signPath: "./public/images/signature.png",
//       };

//       const fileName = `quotation_${
//         req.body.quotationNumber
//       }_${Date.now()}.pdf`;
//       const filePath = path.join("uploads", "quotations", fileName);

//       generateQuotation(poData, filePath);

//       res.download(filePath, fileName, (err) => {
//         if (err) {
//           console.error("Error downloading file:", err);
//         }
//         setTimeout(() => {
//           fs.unlink(filePath, (err) => {
//             if (err) console.error("Error deleting temp file:", err);
//           });
//         }, 60000);
//       });
//     } catch (error) {
//       console.error("Error generating quotation:", error);
//       res.status(500).json({
//         success: false,
//         error: "Failed to generate quotation PDF",
//       });
//     }
//   }
// );
//get pending vk quotations for md approval
app.get("/api/pending-vk_quotations", async (req, res) => {
  try {
    const client = await pool.connect();
    const vkResult = await client.query(`
              SELECT
                  vq.*,
                  COALESCE(SUM(vqi.total_amount), 0) as total_amount,
                  COUNT(vqi.id) as item_count,
                  'vk' as quotation_source
              FROM vk_quotations vq
              LEFT JOIN vk_quotation_items vqi ON vq.id = vqi.quotation_id
              WHERE vq.status = 'pending'
              GROUP BY vq.id
              ORDER BY vq.created_at DESC
          `);
    client.release();
    res.json(vkResult.rows);
    console.log(
      "Fetched pending VK quotations for MD approval:",
      vkResult.rows
    );
  } catch (error) {
    console.error("Error fetching pending VK quotations:", error);
    res.status(500).json({ error: "Failed to fetch pending VK quotations" });
  }
});

// Get pending quotations for MD approval
app.get("/api/pending-quotations", async (req, res) => {
  try {
    const client = await pool.connect();

    // Get regular quotations
    const regularResult = await client.query(`
            SELECT
    q.*,
    COALESCE(SUM(qi.total_amount), 0) AS items_total,
    COUNT(qi.id) AS item_count,
    'regular' AS quotation_source
FROM quotations q
LEFT JOIN quotation_items qi ON q.id = qi.quotation_id
WHERE q.status = 'pending'
GROUP BY q.id
ORDER BY q.created_at DESC;

        `);

    // Get VK quotations

    // Combine results
    const allQuotations = regularResult.rows;

    client.release();
    res.json(allQuotations);
    console.log("Fetched pending quotations for MD approval:", allQuotations);
  } catch (error) {
    console.error("Error fetching pending quotations:", error);
    res.status(500).json({ error: "Failed to fetch pending quotations" });
  }
});
app.get("/api/approved-quotations", async (req, res) => {
  try {
    const client = await pool.connect();

    // Get regular quotations
    const regularResult = await client.query(`
            SELECT
    q.*,
    COALESCE(SUM(qi.total_amount), 0) AS items_total,
    COUNT(qi.id) AS item_count,
    'regular' AS quotation_source
FROM quotations q
LEFT JOIN quotation_items qi ON q.id = qi.quotation_id
WHERE q.status = 'approved'
GROUP BY q.id
ORDER BY q.created_at DESC;

        `);

    // Get VK quotations

    // Combine results
    const allQuotations = regularResult.rows;

    client.release();
    res.json(allQuotations);
    console.log("Fetched pending quotations for MD approval:", allQuotations);
  } catch (error) {
    console.error("Error fetching pending quotations:", error);
    res.status(500).json({ error: "Failed to fetch pending quotations" });
  }
});

// Generate VK quotation number API
app.get("/api/generate-vk-quotation-number", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT generate_vk_quotation_number() as quotation_number"
    );
    let quotationNumber = result.rows[0].quotation_number;

    quotationNumber = quotationNumber.replace("VK-", "VK-KQPS-");
    client.release();

    res.json({ quotationNumber });
  } catch (error) {
    console.error("Error generating VK quotation number:", error);
    res.status(500).json({ error: "Failed to generate VK quotation number" });
  }
});

// Get quotation attachments
app.get("/api/quotations/:id/attachments", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await pool.connect();
    const result = await client.query(
      `
            SELECT
                id,
                file_name,
                original_name,
                file_path,
                file_size,
                mime_type,
                notes,
                uploaded_at
            FROM quotation_attachments
            WHERE quotation_id = $1
            ORDER BY uploaded_at DESC
        `,
      [id]
    );

    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching quotation attachments:", error);
    res.status(500).json({ error: "Failed to fetch quotation attachments" });
  }
});

// Get VK quotation attachments
app.get("/api/vk-quotations/:id/attachments", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await pool.connect();
    const result = await client.query(
      `
            SELECT
                id,
                file_name,
                original_name,
                file_path,
                file_size,
                mime_type,
                notes,
                uploaded_at
            FROM vk_quotation_attachments
            WHERE quotation_id = $1
            ORDER BY uploaded_at DESC
        `,
      [id]
    );

    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching VK quotation attachments:", error);
    res.status(500).json({ error: "Failed to fetch VK quotation attachments" });
  }
});

// Get quotation items
app.get("/api/quotations/:id/items", async (req, res) => {
  try {
    console.log("Fetching items for quotation ID:", req.params);
    const { id } = req.params;
    const client = await pool.connect();
    const result = await client.query(
      `
            SELECT
                id,
                part_no,
                description,
                hsn_code,
                
                quantity,
                unit,
                unit_price,
                
                total_amount
            FROM quotation_items
            WHERE quotation_id = $1
            ORDER BY id
        `,
      [id]
    );

    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching quotation items:", error);
    res.status(500).json({ error: "Failed to fetch quotation items" });
  }
});

// Get complete quotation details by ID
app.get("/api/quotations/:id/details/:type", async (req, res) => {
  console.log("FULL URL:", req.originalUrl);
  console.log("QUERY:", req.query);
  console.log("PARAMS:", req.params);

  console.log(" sourceeee", req.query);
  try {
    const { id } = req.params;
    const source = req.params["type"];
    console.log("souceeee", source); // 'regular' or 'vk'

    const client = await pool.connect();

    let quotationsTable, vkitems, itemsTable, attachmentsTable;

    // Determine which tables to query based on source
    if (source === "VK") {
      quotationsTable = "vk_quotations";

      const quotationResult = await client.query(
        `
            SELECT
                id,
                quotation_type as quotationType,
                quotation_number as quotationNumber,
                quotation_date as quotationDate,
                reference_no as referenceNo,
                valid_until as validUntil,
                currency,
                payment_terms as paymentTerms,
                delivery_duration as deliveryDuration,
                company_name as companyName,
                company_email as companyEmail,
                company_gst as companyGST,
                company_address as companyAddress,
                client_name as clientName,
                client_email as clientEmail,
                client_phone as clientPhone,
                
                
                total_amount as totalAmount,
                notes,
                status,
                created_at,
                updated_at,
                kiet_costs,
                pv_adaptors
            FROM ${quotationsTable}
            WHERE id = $1
        `,
        [id]
      );
      console.log(
        "ghjkvbnvbhjkvhbhjguhbjdsiuchbjdeshubjdshcxbjn dsxhbjn dxh",
        JSON.stringify(quotationResult.rows[0])
      );
      const alli = await client.query(
        `SELECT * FROM vk_quotations WHERE id =$1`,
        [id]
      );
      console.log("all rows   lll", alli.rows[0]["pv_adaptors"]);
      if (quotationResult.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: "Quotation not found" });
      }

      const quotation = quotationResult.rows[0];

      client.release();

      const quotationDetails = {
        ...quotation,
        items: quotationResult.rows,
        quotation_source: source || "regular",
      };

      res.json(quotationDetails);
    } else {
      quotationsTable = "quotations";
      itemsTable = "quotation_items";
      attachmentsTable = "quotation_attachments";
      const quotationResult = await client.query(
        `
            SELECT
                id,
                quotation_type as quotationType,
                quotation_number as quotationNumber,
                quotation_date as quotationDate,
                reference_no as referenceNo,
                valid_until as validUntil,
                currency,
                payment_terms as paymentTerms,
                delivery_duration as deliveryDuration,
                company_name as companyName,
                company_email as companyEmail,
                company_gst as companyGST,
                company_address as companyAddress,
                client_name as clientName,
                client_email as clientEmail,
                client_phone as clientPhone,
                client_company as clientCompany,
                client_address as clientAddress,
                tax_rate as taxRate,
                discount_rate as discountRate,
                total_amount as totalAmount,
                notes,
                status,
                created_at,
                updated_at
                
            FROM "quotations"
            WHERE id = $1
        `,
        [id]
      );
      const itemsResult = await client.query(
        `
            SELECT
                id,
                part_no as partNo,
                description,
                hsn_code as hsnCode,
                gst_rate as gst,
                quantity,
                unit,
                unit_price as unitPrice,
                discount,
                total_amount as total
            FROM ${itemsTable}
            WHERE quotation_id = $1
            ORDER BY id
        `,
        [id]
      );

      // Get quotation attachments
      const attachmentsResult = await client.query(
        `
            SELECT
                id,
                file_name,
                original_name,
                file_path,
                file_size,
                mime_type,
                notes,
                uploaded_at
            FROM ${attachmentsTable}
            WHERE quotation_id = $1
            ORDER BY uploaded_at DESC
        `,
        [id]
      );
      const quotation = quotationResult.rows[0];
      client.release();

      // Combine all data
      const quotationDetails = {
        ...quotation,
        items: itemsResult.rows,
        attachments: attachmentsResult.rows,
        quotation_source: source || "regular",
      };

      res.json(quotationDetails);
    }

    // Get quotation main details

    // Get quotation items
  } catch (error) {
    console.error("Error fetching quotation details:", error);
    res.status(500).json({ error: "Failed to fetch quotation details" });
  }
});

// Get approved quotations
// app.get('/approved-quotations', async (req, res) => {
//     try {
//         const client = await pool.connect();
//         const result = await client.query(`
//             SELECT
//                 q.*,
//                 COALESCE(SUM(qi.total_amount), 0) as total_amount,
//                 COUNT(qi.id) as item_count
//             FROM quotations q
//             LEFT JOIN quotation_items qi ON q.id = qi.quotation_id
//             WHERE q.status = 'approved'
//             GROUP BY q.id
//             ORDER BY q.created_at DESC
//         `);

//         client.release();
//         res.json(result.rows);
//     } catch (error) {
//         console.error('Error fetching approved quotations:', error);
//         res.status(500).json({ error: 'Failed to fetch approved quotations' });
//     }
// });

// Custom Error Classes
class QuotationNotFoundError extends Error {
  constructor(quotationId) {
    super(`Quotation ${quotationId} not found`);
    this.name = "QuotationNotFoundError";
    this.statusCode = 404;
  }
}

class InvalidQuotationSourceError extends Error {
  constructor(source) {
    super(`Invalid quotation source: ${source}`);
    this.name = "InvalidQuotationSourceError";
    this.statusCode = 400;
  }
}

class PDFGenerationError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = "PDFGenerationError";
    this.statusCode = 500;
    this.originalError = originalError;
  }
}

class DatabaseTransactionError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = "DatabaseTransactionError";
    this.statusCode = 500;
    this.originalError = originalError;
  }
}

// Enhanced endpoint with comprehensive error handling
app.put("/api/quotations/:id/approve", async (req, res) => {
  const client = await pool.connect();

  try {
    // Input validation
    const quotationId = req.params.id;
    console.log("QUOTATION BODY", req.body);
    const { quotation_source } = req.body;
    console.log(req.body, "bodyyy");

    if (!quotationId || isNaN(quotationId)) {
      return res.status(400).json({
        error: "Invalid quotation ID",
        details: "Quotation ID must be a valid number",
      });
    }

    if (!quotation_source) {
      return res.status(400).json({
        error: "Missing required field",
        details: "quotation_source is required",
      });
    }

    console.log(
      "Approving quotation ID:",
      quotationId,
      "Source:",
      quotation_source
    );
    // Determine tables
    let quotationsTable, itemsTable;
    if (quotation_source === "vk") {
      quotationsTable = "vk_quotations";
      itemsTable = "vk_quotation_items";
    } else {
      // Default to standard quotations for any non-VK source (regular, standard, etc.)
      quotationsTable = "quotations";
      itemsTable = "quotation_items";
    }

    await client.query("BEGIN");

    // Fetch quotation with error handling
    let quotationResult;
    try {
      quotationResult = await client.query(
        `SELECT * FROM ${quotationsTable} WHERE id = $1`,
        [quotationId]
      );
    } catch (dbError) {
      throw new DatabaseTransactionError(
        "Failed to fetch quotation from database",
        dbError
      );
    }

    if (quotationResult.rows.length === 0) {
      throw new QuotationNotFoundError(quotationId);
    }

    const quotation = quotationResult.rows[0];

    // Check if already approved
    if (quotation.status === "approved") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Quotation already approved",
        details: `Quotation ${quotationId} has already been approved`,
      });
    }

    // Fetch items with error handling
    let itemsResult;
    try {
      itemsResult = await client.query(
        `SELECT * FROM ${itemsTable} WHERE quotation_id = $1 ORDER BY id`,
        [quotationId]
      );
    } catch (dbError) {
      throw new DatabaseTransactionError(
        "Failed to fetch quotation items",
        dbError
      );
    }

    if (itemsResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Cannot approve quotation",
        details: "Quotation has no items",
      });
    }

    // Update status
    try {
      await client.query(
        `UPDATE ${quotationsTable} SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        ["approved", quotationId]
      );
    } catch (dbError) {
      throw new DatabaseTransactionError(
        "Failed to update quotation status",
        dbError
      );
    }

    // Prepare PDF data with validation
    const poData = {
      poNumber: quotation.quotation_number || "N/A",
      date: quotation.quotation_date || new Date().toISOString(),
      expected_date: quotation.valid_until,
      termsOfPayment: quotation.payment_terms || "Net 30",
      currency: quotation.currency || "INR",
      company: {
        name: quotation.company_name || "KIET TECHNOLOGIES PRIVATE LIMITED",
        email: quotation.company_email || "info@kiet.com",
        gst: quotation.company_gst || "29AAFCK6528DIZG",
        address:
          quotation.company_address ||
          "51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111",
        logo: path.join(__dirname, "public", "images", "page_logo.jpg"),
      },
      supplier: {
        name: quotation.client_name || "Unknown Supplier",
        address: quotation.client_address || "Address not provided",
        duration: quotation.delivery_duration,
      },
      shipTo: quotation.client_address || "Address not provided",
      reference_no: quotation.reference_no,
      requester: {
        name: quotation.client_name || "Unknown",
      },
      items: itemsResult.rows.map((row) => ({
        part_no: row.part_no || "N/A",
        description: row.description || "No description",
        hsn_code: row.hsn_code,
        gst: row.gst_rate || 0,
        quantity: row.quantity || 0,
        unit: row.unit || "PCS",
        unit_price: row.unit_price || 0,
        discount: row.discount || 0,
        total: row.total_amount || 0,
      })),
      line: path.join(__dirname, "public", "images", "line.png"),
      signPath: path.join(__dirname, "public", "images", "signature.png"),
    };

    // VK-specific fields with error handling
    if (quotation_source === "vk") {
      try {
        const vkDataResult = await client.query(
          `SELECT kiet_costs, pv_adaptors FROM ${quotationsTable} WHERE id = $1`,
          [quotationId]
        );

        const vkData = vkDataResult.rows[0];

        if (vkData.kiet_costs) {
          try {
            poData.kietCosts = JSON.parse(vkData.kiet_costs);
          } catch (parseError) {
            console.warn("Failed to parse kiet_costs JSON:", parseError);
            poData.kietCosts = null;
          }
        }

        if (vkData.pv_adaptors) {
          try {
            poData.pvAdaptors = JSON.parse(vkData.pv_adaptors);
          } catch (parseError) {
            console.warn("Failed to parse pv_adaptors JSON:", parseError);
            poData.pvAdaptors = null;
          }
        }
      } catch (vkError) {
        console.warn("VK data fetch non-critical error:", vkError);
        // Continue without VK-specific data
      }
    }

    // Generate PDF with error handling
    const sanitizedNumber = (quotation.quotation_number || "unknown").replace(
      /[^a-zA-Z0-9.-]/g,
      "_"
    );
    const fileName = `quotation_${sanitizedNumber}.pdf`;
    const filePath = path.join(qtUploadsDir, fileName);

    try {
      // Verify directory exists
      if (!fs.existsSync(qtUploadsDir)) {
        fs.mkdirSync(qtUploadsDir, { recursive: true });
      }

      if (quotation.quotation_type === "VK") {
        await generateVKQuotation(poData, filePath);
      } else {
        await generateQuotation(poData, filePath);
      }

      // Verify PDF was created
      if (!fs.existsSync(filePath)) {
        throw new PDFGenerationError("PDF file was not created");
      }
    } catch (pdfError) {
      throw new PDFGenerationError("Failed to generate PDF document", pdfError);
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Quotation approved and PDF generated successfully",
      data: {
        quotationId,
        quotationNumber: quotation.quotation_number,
        pdfPath: fileName,
      },
    });
  } catch (error) {
    // Rollback transaction if still active
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError);
    }

    // Log full error details for debugging
    console.error("Error approving quotation:", {
      error: error.message,
      stack: error.stack,
      quotationId: req.params.id,
      timestamp: new Date().toISOString(),
    });

    // Handle custom errors
    if (
      error instanceof QuotationNotFoundError ||
      error instanceof InvalidQuotationSourceError
    ) {
      return res.status(error.statusCode).json({
        error: error.message,
        quotationId: req.params.id,
      });
    }

    if (
      error instanceof PDFGenerationError ||
      error instanceof DatabaseTransactionError
    ) {
      return res.status(error.statusCode).json({
        error: error.message,
        details: "Please contact support if this issue persists",
      });
    }

    // Handle unexpected errors
    res.status(500).json({
      error: "Failed to approve quotation",
      message: "An unexpected error occurred. Please try again later.",
    });
  } finally {
    // Always release the client
    try {
      
      client.release();
    } catch (releaseError) {
      console.error("Failed to release database client:", releaseError);
    }
  }
});

// Reject quotation
app.put("/api/quotations/:id/reject", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const quotationId = req.params.id;
    const { reason, quotation_source } = req.body;

    // Determine which table to update based on quotation source
    const quotationsTable =
      quotation_source === "vk" ? "vk_quotations" : "quotations";

    // Update quotation status and add rejection reason
    await client.query(
      `UPDATE ${quotationsTable} SET status = $1, notes = CONCAT(COALESCE(notes, ''), '\\n\\nRejected: ', $2), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      ["rejected", reason, quotationId]
    );

    // Log rejection action
    console.log(`Quotation ${quotationId} rejected by MD. Reason: ${reason}`);

    await client.query("COMMIT");

    res.json({ success: true, message: "Quotation rejected successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error rejecting quotation:", error);
    res.status(500).json({ error: "Failed to reject quotation" });
  } finally {
    client.release();
  }
});

// Send VK quotation approval request (separate API for VK quotations)
app.post(
  "/api/send-vk-quotation-approval",
  quotationUpload.array("attachments[]"),
  async (req, res) => {
    console.log("🔄 Starting send-vk-quotation-approval request");
    console.log("Request body keys:", Object.keys(req.body));
    console.log("Files received:", req.files ? req.files.length : 0);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Generate unique VK quotation number
      const quotationNumber = await client.query(
        "SELECT generate_vk_quotation_number() as quotation_number"
      );
      let quotationNumberValue = quotationNumber.rows[0].quotation_number;
      quotationNumberValue = quotationNumberValue.replace("VK-", "VK-KQPS-");
      console.log("Generated VK quotation number:", quotationNumber);

      // Extract form data
      const {
        quotationDate,
        referenceno,
        validUntil,
        currency,
        paymentTerms,
        deliveryDuration,
        companyName,
        companyEmail,
        companyGST,
        companyAddress,

        clientName,
        clientEmail,
        clientPhone,
        notes,
      } = req.body;

      console.log("VK Form data extracted:", req.body);

      // Parse PV adaptors data (this is the main data for VK quotations)
      const pvAdaptors = req.body.pvAdaptors
        ? JSON.parse(req.body.pvAdaptors)
        : [];
      const kietCosts = req.body.kietCosts
        ? JSON.parse(req.body.kietCosts)
        : [];

      console.log("PV Adaptors data:", pvAdaptors.length, "adaptors");
      console.log("KIET Costs data:", kietCosts.length, "cost items");

      // Calculate total amount from PV adaptors
      let totalAmount = 0;
      pvAdaptors.forEach((adaptor) => {
        const qty = parseFloat(adaptor.qty) || 0;
        const rate = parseFloat(adaptor.rate) || 0;
        totalAmount += qty * rate;
      });
      console.log("Calculated total amount from PV adaptors:", totalAmount);

      // Insert VK quotation with pending approval status
      const quotationQuery = `
            INSERT INTO vk_quotations (
                quotation_type, quotation_number, quotation_date, reference_no,
                valid_until, currency, payment_terms, delivery_duration,
                company_name, company_email, company_gst, company_address,
                client_name, client_email, client_phone,
                total_amount, notes, status, created_by, kiet_costs, pv_adaptors
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING id
        `;

      // Set default valid_until to 30 days from now if not provided
      const defaultValidUntil =
        validUntil ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      const quotationValues = [
        "VK",
        quotationNumberValue,
        quotationDate || new Date().toISOString().split("T")[0],
        referenceno || null,
        defaultValidUntil,
        currency || "INR",
        paymentTerms || null,
        deliveryDuration || null,
        companyName || null,
        companyEmail || null,
        companyGST || null,
        companyAddress || null,
        clientName || null,
        clientEmail || null,
        clientPhone || null,
        totalAmount,
        notes || null,
        "pending",
        req.session.user ? req.session.user.email : null,
        JSON.stringify(kietCosts),
        JSON.stringify(pvAdaptors),
      ];
      console.log("Inserting VK quotation with values:", quotationValues);

      const quotationResult = await client.query(
        quotationQuery,
        quotationValues
      );
      const quotationId = quotationResult.rows[0].id;
      console.log("VK quotation inserted with ID:", quotationId);

      // Insert attachments
      if (req.files && req.files.length > 0) {
        const attachmentNotes = req.body.attachmentNotes || [];

        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          const attachmentQuery = `
                    INSERT INTO vk_quotation_attachments (
                        quotation_id, file_name, original_name, file_path,
                        file_size, mime_type, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                `;

          const attachmentValues = [
            quotationId,
            file.filename,
            file.originalname,
            file.path,
            file.size,
            file.mimetype,
            attachmentNotes[i] || "",
          ];

          await client.query(attachmentQuery, attachmentValues);
        }
        console.log("VK quotation attachments inserted");
      }

      await client.query("COMMIT");
      console.log("VK quotation transaction committed successfully");

      // Send email notification to MD
      console.log("Sending email notification to MD for VK quotation...");
      const transporter = nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        auth: {
          user: "No-reply@kietsindia.com",
          pass: "process.env.NO_PASSWORD",
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const mailOptions = {
        from: "No-reply@kietsindia.com",
        to: "chandrashekaraiah.r@gmail.com", // MD email
        subject: `VK Quotation Approval Required: ${quotationNumber}`,
    
             html: `
   
     
    <div style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 10px;">

  <div style="max-width: 620px; margin: auto; background: #ffffff; padding: 10px 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">

    <p style="font-size: 15px; color: #333; line-height: 1.7;"><strong>Dear MD Sir,</strong></p>

    <p style="font-size: 15px; color: #444; line-height: 1.5;" >
      We wish to notify you that a new quotation has been prepared and is now awaiting your approval.<br>
      Please find the summary details below for your reference:
    </p>

    <table cellpadding="10" cellspacing="0" 
       style="margin: 18px 0; font-size: 14px; border-collapse: collapse; width: 100%; background: #fafafa; border-radius: 6px; border: 1px solid #ccc;">

      <tr>
        <td style="border-bottom: 1px solid #e6e6e6; width: 40%;"><strong>Quotation Number:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${quotationNumberValue}</td>
      </tr>
      <tr>
        <td style="border-bottom: 1px solid #e6e6e6;"><strong>Quotation Type:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">VK</td>
      </tr>
      <tr>
        <td style="border-bottom: 1px solid #e6e6e6;"><strong>Client Name:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${clientName}</td>
      </tr>
      <tr>
        <td style="border-bottom: 1px solid #e6e6e6;"><strong>Submitted By:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${req.session.user ? req.session.user.email :'Unknown'}</td>
      </tr>
      <tr>
        <td><strong>Submission Date:</strong></td>
        <td>${quotationDate}</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://kietprocure.com/"
        style="background: #0056b3; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block;">
        Review Quotation
      </a>
    </div>
  

    
  
  <div style="text-align: center; padding: 20px; border-top: 1px solid #ddd;">
      <img src="cid:logoImage" alt="Company Logo"
        style="width: 90px; height: auto; margin-bottom: 10px;" />

      <div style="font-size: 16px; font-weight: bold; color: #000;">
        KIET TECHNOLOGIES PVT LTD
      </div>

      <div style="font-size: 13px; margin-top: 5px;">
        📍 51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru, Karnataka 560111
      </div>

      <div style="font-size: 13px; margin-top: 5px;">
        📞 +91 98866 30491 &nbsp;|&nbsp; ✉️ info@kietsindia.com &nbsp;|&nbsp;
        🌐 <a href="https://kietsindia.com" style="color:#0066cc; text-decoration:none;">kietsindia.com</a>
      </div>

      <!-- Social Icons -->
      <div style="margin-top: 12px;">
        <a href="https://facebook.com" style="margin: 0 6px;">
          <img src="cid:fbIcon" width="22" />
        </a>
        <a href="https://linkedin.com/company" style="margin: 0 6px;">
          <img src="cid:lkIcon" width="22" />
        </a>
        <a href="https://instagram.com" style="margin: 0 6px;">
          <img src="cid:igIcon" width="22" />
        </a>
        <a href="https://kietsindia.com" style="margin: 0 6px;">
          <img src="cid:webIcon" width="22" />
        </a>
      </div>

      <div style="font-size: 11px; color: #777; margin-top: 15px;">
        © 2025 KIET TECHNOLOGIES PVT LTD — All Rights Reserved.
      </div>
    </div>
  </div>























</div>



    </div>
</div>


    

   
    
  `,
        attachments: [
          {
            filename: "lg.jpg",
            path: "public/images/lg.jpg",
            cid: "logoImage",
          },
        ],
      };

      try {
        const info = await transporter.sendMail(mailOptions);
        console.log("✅ VK approval request email sent to MD:", info.response);
      } catch (err) {
        console.error("❌ Email failed:", err);
      }

      // Send push notification to MD
      try {
        await sendNotification("MD", {
          title: "New VK Quotation Approval Required",
          body: `VK Quotation ${quotationNumber} from ${clientName} requires your approval`,
          icon: "/images/page_logo.png",
          data: {
            type: "vk_quotation_approval",
            quotationId: quotationId,
            quotationNumber: quotationNumberValue,
          },
        });
        console.log(
          "✅ Push notification sent to MD for VK quotation approval"
        );
      } catch (pushErr) {
        console.error("❌ Push notification failed:", pushErr);
      }

      console.log("✅ VK quotation approval request completed successfully");
      res.json({
        success: true,
        message: "VK quotation approval request sent successfully",
        quotationNumber: quotationNumberValue,
        quotationId: quotationId,
      });
    } catch (error) {
      console.error("❌ Error in send-vk-quotation-approval:", error);
      console.error("Error stack:", error.stack);
      await client.query("ROLLBACK");
      res.status(500).json({
        success: false,
        error: "Failed to send VK quotation approval request",
        details: error.message,
      });
    } finally {
      client.release();
    }
  }
);

// Send quotation approval request (for regular quotations)
app.post(
  "/api/send-quotation-approval",
  quotationUpload.array("attachments[]"),
  async (req, res) => {
    console.log("🔄 Starting send-quotation-approval request");
    console.log("Request body keys:", Object.keys(req.body));
    console.log("Files received:", req.files ? req.files.length : 0);
    console.log("Quotation request body:", req.body);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Generate unique quotation number
      const quotationNumberResult = await client.query(
        "SELECT generate_quotation_number() as quotation_number"
      );
      const quotationNumber = quotationNumberResult.rows[0].quotation_number;
      console.log("Generated quotation number:", quotationNumber);
      console.log("quotation req body items:", req.body);

      // Extract form data
      const {
        quotationType,
        quotationDate,
        referenceNo,
        validUntil,
        currency,
        paymentTerms,
        deliveryDuration,
        companyName,
        companyEmail,
        companyGST,
        companyAddress,
        clientName,
        clientEmail,
        clientPhone,
        clientCompany,
        clientAddress,
        gstterms,
        packaging,
        insurance,
        deliveryTerms,

        notes,
      } = req.body;

      const items = [];
      const formData = req.body || {};

      const itemDescriptions =
        (formData && formData["itemDescription"]) ||
        (formData && formData.itemDescription) ||
        [];
      let itemQuantities, itemPrices, itemPartNos, itemHSNs, itemUnits;

      itemQuantities =
        (formData && formData["itemQuantity"]) ||
        (formData && formData.itemQuantity) ||
        [];
      itemPrices =
        (formData && formData["itemPrice"]) ||
        (formData && formData.itemPrice) ||
        [];

      itemPartNos =
        (formData && formData["itemPartNo"]) ||
        (formData && formData.itemPartNo) ||
        [];
      itemHSNs =
        (formData && formData["itemHSN"]) ||
        (formData && formData.itemHSN) ||
        [];
      itemUnits =
        (formData && formData["itemUnit"]) ||
        (formData && formData.itemUnit) ||
        [];

      let subtotal = 0;

      itemDescriptions.forEach((desc, index) => {
        const quantity = parseFloat(itemQuantities[index]) || 0;
        const price = parseFloat(itemPrices[index]) || 0;

        subtotal += quantity * price;

        items.push({
          part_no: itemPartNos[index] || "",
          description: desc,
          hsn_code: itemHSNs[index] || "",

          quantity: quantity,
          unit: itemUnits[index] || "Nos",
          unit_price: price,
        });
      });

      console.log("Form data extracted:", {
        quotationType,
        quotationDate,
        clientName,
        items: items ? "present" : "missing",
      });

      // Parse items JSON
      console.log("Raw items data:", items);
      console.log("Type of items:", typeof items);
      let itemsData;

      try {
        if (typeof items === "string") {
          itemsData = JSON.parse(items);
        } else if (Array.isArray(items)) {
          itemsData = items;
        } else {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            error: "Invalid items data format",
          });
        }
      } catch (e) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "Invalid JSON",
          details: e.message,
        });
      }

      console.log("Parsed items data:", itemsData);

      // ✅ Calculate total correctly
      let totalAmount = 0;

      for (const item of itemsData) {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        totalAmount += qty * price;
      }

      console.log("Calculated total amount:", totalAmount);

      // Insert quotation with pending approval status
      const quotationQuery = `
            INSERT INTO quotations (
                quotation_type, quotation_number, quotation_date, reference_no,
                valid_until, currency, payment_terms, delivery_duration,
                company_name, company_email, company_gst, company_address,
                client_name, client_email, client_phone, client_company, client_address,
                 total_amount, notes, status, created_by,gstterms,packaging,insurance,deliveryTerms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,$22,$23,$24,$25)
            RETURNING id
        `;

      const quotationValues = [
        quotationType,
        quotationNumber,
        quotationDate,
        referenceNo,
        validUntil,
        currency,
        paymentTerms,
        deliveryDuration,
        companyName,
        companyEmail,
        companyGST,
        companyAddress,
        clientName,
        clientEmail,
        clientPhone,
        clientCompany,
        clientAddress,

        totalAmount,
        notes,
        "pending",
        req.session.user ? req.session.user.email : null,
        gstterms,
        packaging,
        insurance,
        deliveryTerms,
      ];

      const quotationResult = await client.query(
        quotationQuery,
        quotationValues
      );
      const quotationId = quotationResult.rows[0].id;

      // Insert items
      for (const item of itemsData) {
        const itemQuery = `
                INSERT INTO quotation_items (
                    quotation_id, part_no, description, hsn_code,
                    quantity, unit, unit_price,  total_amount
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;

        const itemValues = [
          quotationId,
          item.part_no,
          item.description,
          item.hsn_code,

          item.quantity,
          item.unit,
          item.unit_price,

          totalAmount,
        ];

        await client.query(itemQuery, itemValues);
      }

      // Insert attachments
      if (req.files && req.files.length > 0) {
        const attachmentNotes = req.body.attachmentNotes || [];

        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          const attachmentQuery = `
                    INSERT INTO quotation_attachments (
                        quotation_id, file_name, original_name, file_path,
                        file_size, mime_type, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                `;

          const attachmentValues = [
            quotationId,
            file.filename,
            file.originalname,
            file.path,
            file.size,
            file.mimetype,
            attachmentNotes[i] || "",
          ];

          await client.query(attachmentQuery, attachmentValues);
        }
      }

      await client.query("COMMIT");
      console.log("Transaction committed successfully");

      // Send email notification to MD
      console.log("Sending email notification to MD...");
      const transporter = nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        auth: {
          user: "No-reply@kietsindia.com",
          pass: "process.env.NO_PASSWORD",
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const mailOptions = {
        from: "No-reply@kietsindia.com",
        to: "chandrashekaraiah.r@kietsindia.com", // MD email
        subject: `Quotation Approval Required: ${quotationNumber}`,
       
              
  html: `
   
     
    <div style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 10px;">

  <div style="max-width: 620px; margin: auto; background: #ffffff; padding: 10px 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">

    <p style="font-size: 15px; color: #333; line-height: 1.7;"><strong>Dear MD Sir,</strong></p>

    <p style="font-size: 15px; color: #444; line-height: 1.5;" >
      We wish to notify you that a new Purchase Order has been prepared and is now awaiting your Final approval.<br>
      Please find the summary details below for your reference:
    </p>

    <table cellpadding="10" cellspacing="0" 
       style="margin: 18px 0; font-size: 14px; border-collapse: collapse; width: 100%; background: #fafafa; border-radius: 6px; border: 1px solid #ccc;">

      <tr>
        <td style="border-bottom: 1px solid #e6e6e6; width: 40%;"><strong>Quotation Number:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${quotationNumber}</td>
      </tr>
       <tr>
        <td style="border-bottom: 1px solid #e6e6e6; width: 40%;"><strong>Quotation Type:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${quotationType}</td>
      </tr>
    
      <tr>
        <td style="border-bottom: 1px solid #e6e6e6;"><strong>Client Name:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${clientName}}</td>
      </tr>
      <tr>
        <td style="border-bottom: 1px solid #e6e6e6;"><strong>Submitted By:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${req.session.user ? req.session.user.email : "Unknown"}</td>
      </tr>
     

      <tr>
        <td><strong>Submission Date:</strong></td>
        <td> ${quotationDate}</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://kietprocure.com/"
        style="background: #0056b3; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block;">
        Review Quotation
      </a>
    </div>
  

    
  
  <div style="text-align: center; padding: 20px; border-top: 1px solid #ddd;">
      <img src="cid:logoImage" alt="Company Logo"
        style="width: 90px; height: auto; margin-bottom: 10px;" />

      <div style="font-size: 16px; font-weight: bold; color: #000;">
        KIET TECHNOLOGIES PVT LTD
      </div>

      <div style="font-size: 13px; margin-top: 5px;">
        📍 51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru, Karnataka 560111
      </div>

      <div style="font-size: 13px; margin-top: 5px;">
        📞 +91 98866 30491 &nbsp;|&nbsp; ✉️ info@kietsindia.com &nbsp;|&nbsp;
        🌐 <a href="https://kietsindia.com" style="color:#0066cc; text-decoration:none;">kietsindia.com</a>
      </div>

      <!-- Social Icons -->
      <div style="margin-top: 12px;">
        <a href="https://facebook.com" style="margin: 0 6px;">
          <img src="cid:fbIcon" width="22" />
        </a>
        <a href="https://linkedin.com/company" style="margin: 0 6px;">
          <img src="cid:lkIcon" width="22" />
        </a>
        <a href="https://instagram.com" style="margin: 0 6px;">
          <img src="cid:igIcon" width="22" />
        </a>
        <a href="https://kietsindia.com" style="margin: 0 6px;">
          <img src="cid:webIcon" width="22" />
        </a>
      </div>

      <div style="font-size: 11px; color: #777; margin-top: 15px;">
        © 2025 KIET TECHNOLOGIES PVT LTD — All Rights Reserved.
      </div>
    </div>
  </div>























</div>



    </div>
</div>


    

   
    
  `,
        attachments: [
          {
            filename: "lg.jpg",
            path: "public/images/lg.jpg",
            cid: "logoImage",
          },
        ],
      };

      try {
        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Approval request email sent to MD:", info.response);
      } catch (err) {
        console.error("❌ Email failed:", err);
      }

      // Send push notification to MD
      try {
        await sendNotification("MD", {
          title: "New Quotation Approval Required",
          body: `Quotation ${quotationNumber} from ${clientName} requires your approval`,
          icon: "/images/page_logo.png",
          data: {
            type: "quotation_approval",
            quotationId: quotationId,
            quotationNumber: quotationNumber,
          },
        });
        console.log("✅ Push notification sent to MD for quotation approval");
      } catch (pushErr) {
        console.error("❌ Push notification failed:", pushErr);
      }

      console.log("✅ Quotation approval request completed successfully");
      res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Quotation Approval</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
          .success { color: green; font-size: 20px; margin-bottom: 20px; }
          button { padding: 10px 20px; font-size: 16px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="success">✅ Quotation approval request sent successfully!</div>
        <button onclick="window.history.back()">Go Back</button>
      </body>
    </html>
  `);
    } catch (error) {
      console.error("❌ Error in send-quotation-approval:", error);
      console.error("Error stack:", error.stack);
      await client.query("ROLLBACK");
      res.status(500).json({
        success: false,
        error: "Failed to send quotation approval request",
        details: error.message,
      });
    } finally {
      client.release();
    }
  }
);

// Send VK quotation approval request (separate API for VK quotations)
app.post(
  "/api/send-vk-quotation-approval",
  quotationUpload.array("attachments[]"),
  async (req, res) => {
    console.log("🔄 Starting send-vk-quotation-approval request");
    console.log("Request body keys:", Object.keys(req.body));
    console.log("Files received:", req.files ? req.files.length : 0);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Generate unique VK quotation number
      const now = new Date();
      const year = now.getFullYear();

      // Get the next sequence number for VK quotations
      const seqResult = await client.query(
        `INSERT INTO quotation_sequence (year, current_sequence)
             VALUES ($1, 1)
             ON CONFLICT (year) DO UPDATE SET current_sequence = quotation_sequence.current_sequence + 1
             RETURNING current_sequence`,
        [year]
      );
      const nextSeq = seqResult.rows[0].current_sequence;

      console.log("Generated VK quotation number:", quotationNumberValue);

      // Extract form data
      const {
        quotationDate,
        referenceNo,
        validUntil,
        currency,
        paymentTerms,
        deliveryDuration,
        companyName,
        companyEmail,
        companyGST,
        companyAddress,

        clientName,
        clientEmail,
        clientPhone,

        notes,
      } = req.body;

      console.log("VK Form data extracted:", { quotationDate, clientName });

      // Parse PV adaptors data (this is the main data for VK quotations)
      const pvAdaptors = req.body.pvAdaptors
        ? JSON.parse(req.body.pvAdaptors)
        : [];
      const kietCosts = req.body.kietCosts
        ? JSON.parse(req.body.kietCosts)
        : [];

      console.log("PV Adaptors data:", pvAdaptors.length, "adaptors");
      console.log("KIET Costs data:", kietCosts.length, "cost items");

      // Calculate total amount from PV adaptors
      let totalAmount = 0;
      pvAdaptors.forEach((adaptor) => {
        const qty = parseFloat(adaptor.qty) || 0;
        const rate = parseFloat(adaptor.rate) || 0;
        totalAmount += qty * rate;
      });
      console.log("Calculated total amount from PV adaptors:", totalAmount);

      // Insert VK quotation with pending approval status
      const quotationQuery = `
            INSERT INTO vk_quotations (
                quotation_type, quotation_number, quotation_date, reference_no,
                valid_until, currency, payment_terms, delivery_duration,
                company_name, company_email, company_gst, company_address, company_phone, company_website,
                client_name, client_email, client_phone, client_company, client_designation, client_address,
                total_amount, notes, status, created_by, kiet_costs, pv_adaptors
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
            RETURNING id
        `;

      // Set default valid_until to 30 days from now if not provided
      const defaultValidUntil =
        validUntil ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      const quotationValues = [
        "VK",
        quotationNumber,
        quotationDate || new Date().toISOString().split("T")[0],
        referenceNo || null,
        defaultValidUntil,
        currency || "INR",
        paymentTerms || null,
        deliveryDuration || null,
        companyName || null,
        companyEmail || null,
        companyGST || null,
        companyAddress || null,
        clientName || null,
        clientEmail || null,
        clientPhone || null,
        totalAmount,
        notes || null,
        "pending",
        req.session.user ? req.session.user.email : null,
        JSON.stringify(kietCosts),
        JSON.stringify(pvAdaptors),
      ];

      const quotationResult = await client.query(
        quotationQuery,
        quotationValues
      );
      const quotationId = quotationResult.rows[0].id;
      console.log("VK quotation inserted with ID:", quotationId);

      // Insert attachments
      if (req.files && req.files.length > 0) {
        const attachmentNotes = req.body.attachmentNotes || [];

        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          const attachmentQuery = `
                    INSERT INTO vk_quotation_attachments (
                        quotation_id, file_name, original_name, file_path,
                        file_size, mime_type, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                `;

          const attachmentValues = [
            quotationId,
            file.filename,
            file.originalname,
            file.path,
            file.size,
            file.mimetype,
            attachmentNotes[i] || "",
          ];

          await client.query(attachmentQuery, attachmentValues);
        }
        console.log("VK quotation attachments inserted");
      }

      await client.query("COMMIT");
      console.log("VK quotation transaction committed successfully");

      // Send email notification to MD
      console.log("Sending email notification to MD for VK quotation...");
      const transporter = nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        auth: {
          user: "No-reply@kietsindia.com",
          pass: "process.env.NO_PASSWORD",
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const mailOptions = {
        from: "No-reply@kietsindia.com",
        to: "shashank@kietsindia.com", // MD email
        subject: `VK Quotation Approval Required: ${quotationNumber}`,
        text: `
Hello MD,

A new VK quotation has been submitted and requires your approval.

📋 VK Quotation Details:
- Quotation Number: ${quotationNumber}
- Type: VK
- Client: ${clientName}
- Submitted by: ${req.session.user ? req.session.user.email : "Unknown"}
- Date: ${quotationDate}
- PV Adaptors: ${pvAdaptors.length} items

Please review and approve the VK quotation through the MD dashboard.

Best regards,
VK Quotation System
KIET TECHNOLOGIES PVT LTD
            `,
        attachments: [
          {
            filename: "lg.jpg",
            path: "public/images/lg.jpg",
            cid: "logoImage",
          },
        ],
      };

      try {
        const info = await transporter.sendMail(mailOptions);
        console.log("✅ VK approval request email sent to MD:", info.response);
      } catch (err) {
        console.error("❌ Email failed:", err);
      }

      console.log("✅ VK quotation approval request completed successfully");
      res.json({
        success: true,
        message: "VK quotation approval request sent successfully",
        quotationNumber: quotationNumber,
        quotationId: quotationId,
      });
    } catch (error) {
      console.error("❌ Error in send-vk-quotation-approval:", error);
      console.error("Error stack:", error.stack);
      await client.query("ROLLBACK");
      res.status(500).json({
        success: false,
        error: "Failed to send VK quotation approval request",
        details: error.message,
      });
    } finally {
      client.release();
    }
  }
);

// info added to database and generate the quotation for md created by md

app.post("/md/trade_generation", upload.none(), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Generate new quotation number
    const quotationNumberResult = await client.query(
      "SELECT generate_quotation_number() AS quotation_number"
    );
    const quotationNumber = quotationNumberResult.rows[0].quotation_number;
    console.log("Generated quotation number:", quotationNumber);
    console.log("quotation req body items:", req.body);

    // Extract fields from form
    const {
      quotationType,
      quotationDate,
      referenceNo,
      validUntil,
      currency,
      paymentTerms,
      deliveryDuration,
      companyName,
      companyEmail,
      companyGST,
      companyAddress,
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      clientAddress,
      gst,
      packaging,
      insurance,
      deliveryTerms,

      notes,
    } = req.body;

    // Log received data for debugging
    console.log("Form data extracted:", {
      quotationType,
      quotationDate,
      clientName,
      hasItems: req.body.itemPartNo ? true : false,
    });

    // Validate minimal fields
    if (!quotationDate || !clientName) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        details: "quotationDate or clientName missing",
      });
    }

    // ✅ Construct items array from parallel arrays
    let itemsData = [];
    if (req.body.itemPartNo && Array.isArray(req.body.itemPartNo)) {
      const count = req.body.itemPartNo.length;
      for (let i = 0; i < count; i++) {
        itemsData.push({
          partNo: req.body.itemPartNo[i],
          description: req.body.itemDescription[i],
          hsn: req.body.itemHSN[i],

          quantity: parseFloat(req.body.itemQuantity[i]) || 0,
          unit: req.body.itemUnit[i],
          unitPrice: parseFloat(req.body.itemPrice[i]) || 0,

          total: parseFloat(req.body.itemTotal[i]) || 0,
        });
      }
    } else {
      console.error("Item arrays missing from form data");
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Invalid items data format",
        details: "Expected itemPartNo[] and other arrays in the form data",
      });
    }

    console.log("Constructed items data:", itemsData.length, "items");
    console.table(itemsData); // Prints a nice table in console

    // ✅ Calculate total amount
    const totalAmount = itemsData.reduce(
      (sum, item) => sum + (parseFloat(item.total) || 0),
      0
    );
    console.log("Calculated total amount:", totalAmount);

    // ✅ Insert quotation
    const quotationQuery = `
      INSERT INTO quotations (
        quotation_type, quotation_number, quotation_date, reference_no,
        valid_until, currency, payment_terms, delivery_duration,
        company_name, company_email, company_gst, company_address,
        client_name, client_email, client_phone, client_company, client_address,
        total_amount, notes, status, created_by,gstterms,packaging,insurance,deliveryterms
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25
      )
      RETURNING id
    `;

    const quotationValues = [
      quotationType || "Trade", // default if missing
      quotationNumber,
      quotationDate,
      referenceNo,
      validUntil,
      currency,
      paymentTerms,
      deliveryDuration,
      companyName,
      companyEmail,
      companyGST,
      companyAddress,
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      clientAddress,
      totalAmount,
      notes,
      "approved",
      req.session?.user?.email || null,
      gst,
      packaging,
      insurance,
      deliveryTerms,
    ];

    const quotationResult = await client.query(quotationQuery, quotationValues);
    const quotationId = quotationResult.rows[0].id;

    // ✅ Insert quotation items
    const itemQuery = `
      INSERT INTO quotation_items (
        quotation_id, part_no, description, hsn_code,
        quantity, unit, unit_price, total_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    for (const item of itemsData) {
      const itemValues = [
        quotationId,
        item.partNo,
        item.description,
        item.hsn,

        item.quantity,
        item.unit,
        item.unitPrice,

        item.total,
      ];
      await client.query(itemQuery, itemValues);
    }

    // ✅ Commit transaction
    await client.query("COMMIT");

    // ✅ Send success response
    res.status(201).json({
      success: true,
      message: "Quotation created successfully",
      quotationId,
      quotationNumber,
      totalItems: itemsData.length,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error generating quotation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate quotation",
      details: error.message,
    });
  } finally {
    client.release();
  }
});

//update the quotation info in database and generate the quotation for md created by md
app.put("/api/quotations/:id/items", async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;
    console.log("PUT /api/quotations/:id/items called", items);
    const grandTotal = items.reduce((sum, item) => {
      return sum + Number(item.total || 0);
    }, 0);

    console.log("Grand totalasdfghjkl;lkjhgfdsa =", grandTotal);

    console.log("Updating quotation items for ID:", id);
    console.log("Items received:", items);

    const client = await pool.connect();

    // 1. Delete old items
    await client.query(`DELETE FROM quotation_items WHERE quotation_id = $1`, [
      id,
    ]);

    // 2. Insert new items
    for (let item of items) {
      await client.query(
        `
        INSERT INTO quotation_items
        (quotation_id, part_no, description, hsn_code, quantity, unit, unit_price, total_amount)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          id,
          item.partNo,
          item.description,
          item.hsn,
          item.quantity,
          item.unit,
          item.unitPrice,
          item.total,
        ]
      );
    }
    await client.query(
      `UPDATE quotations SET total_amount = $1 WHERE id = $2`,
      [grandTotal, id]
    );

    client.release();

    res.json({ message: "Quotation items updated successfully" });
  } catch (error) {
    console.error("Error updating quotation items:", error);
    res.status(500).json({ error: "Failed to update quotation items" });
  }
});

//custom api for get approved vk quotations\
app.get("/api/render-vk_quotations", async (req, res) => {
  const client = await pool.connect();

  // Determine which tables to query based on source

  const quotationResult = await client.query(`
    SELECT
        id,
        quotation_type AS "quotationType",
        quotation_number AS "quotationNumber",
        quotation_date AS "quotationDate",
        reference_no AS "referenceNo",
        valid_until AS "validUntil",
        currency,
        payment_terms AS "paymentTerms",
        delivery_duration AS "deliveryDuration",
        company_name AS "companyName",
        company_email AS "companyEmail",
        company_gst AS "companyGST",
        company_address AS "companyAddress",
        client_name AS "clientName",
        client_email AS "clientEmail",
        client_phone AS "clientPhone",
        client_address AS "clientAddress",

        kiet_costs::jsonb AS "kietCosts",
        pv_adaptors::jsonb AS "pvAdaptors",

        total_amount AS "totalAmount",
        notes,
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt",created_by AS "createdBy"

    FROM vk_quotations
    WHERE status = 'approved'
    ORDER BY created_at DESC;
  `);
  client.release();

  res.json(quotationResult.rows);
});

//custom api for get approved mae quotations
app.get("/api/render-mae_quotations", async (req, res) => {
  const client = await pool.connect();

  const quotationResult = await client.query(`
    SELECT
        id,
        quotationnumber AS "quotationNumber",
        quotationdate AS "quotationDate",
        validuntil AS "validUntil",
        currency,
        companyname AS "companyName",
        companyaddress AS "companyAddress",
        clientname AS "clientName",
        clientemail AS "clientEmail",
        clientphone AS "clientPhone",
        textarea_details AS "textareaDetails",
        maepaymentterms AS "paymentTerms",
        maegstterms AS "gstTerms",
        maeinsurance AS "insurance",
        maewarranty AS "warranty",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        created_by 

    FROM mae_quotations
    
    ORDER BY created_at DESC;
  `);
  client.release();

  res.json(quotationResult.rows);
});

// Route to get VK quotation details for editing
app.get("/edit-vk-quotation/:id", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { id } = req.params;
    const client = await pool.connect();

    const quotationResult = await client.query(
      `
      SELECT
        id,
        quotation_type,
        quotation_number,
        quotation_date,
        reference_no,
        valid_until,
        currency,
        payment_terms,
        delivery_duration,
        company_name,
        company_email,
        company_gst,
        company_address,
        client_name,
        client_email,
        client_phone,
        gstterms,
        packaging,
        insurance,
        deliveryTerms,
        kiet_costs,
        pv_adaptors,
        total_amount,
        notes,
        status,
        created_at,
        created_by
      FROM vk_quotations
      WHERE id = $1 AND status = 'approved'
    `,
      [id]
    );

    client.release();

    if (quotationResult.rows.length === 0) {
      return res.status(404).send("VK Quotation not found or not approved");
    }

    const quotation = quotationResult.rows[0];

    // Parse JSON fields
    quotation.kietCosts = quotation.kiet_costs || [];
    quotation.pvAdaptors = quotation.pv_adaptors || [];
    res.json(quotation);
  } catch (error) {
    console.error("Error fetching VK quotation for editing:", error);
    res.status(500).send("Internal server error");
  }
});

// Route to update VK quotation
app.post("/update-vk-quotation/:id", upload.none(), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const {
      quotationNumber,
      quotationDate,
      referenceNo,
      validUntil,
      currency,
      paymentTerms,
      deliveryDuration,
      companyName,
      companyEmail,
      companyGST,
      companyAddress,
      clientName,
      clientEmail,
      clientPhone,
      gstterms,
      packaging,
      insurance,
      deliveryTerms,
      notes,
    } = req.body;

    // Parse KIET costs and PV adaptors from form data
    let kietCosts = [];
    let pvAdaptors = [];

    // Parse KIET costs
    if (req.body.itemDescription && Array.isArray(req.body.itemDescription)) {
      req.body.itemDescription.forEach((desc, index) => {
        const cost = parseFloat(req.body.priceInput[index]) || 0;
        const qty = parseFloat(req.body.qtyInput[index]) || 0;

        kietCosts.push({
          description: desc,
          cost: cost,
          qty: qty,
          totalValue: (cost * qty).toFixed(2),
        });
      });
    }

    // Parse PV adaptors
    if (req.body.pvQty && Array.isArray(req.body.pvQty)) {
      req.body.pvQty.forEach((qty, index) => {
        pvAdaptors.push({
          slNo: index + 1,
          qty: parseFloat(qty) || 0,
          familyName: req.body.pvFamilyName[index] || "",
          revNo: req.body.pvRevNo[index] || "",
          coaxialPin: req.body.pvCoaxialPin[index] || "",
          sokCard: req.body.pvSokCard[index] || "",
          sokQty: parseFloat(req.body.pvSokQty[index]) || 0,
          rate: parseFloat(req.body.pvRate[index]) || 0,
          totalAmount: (
            parseFloat(qty) * parseFloat(req.body.pvRate[index] || 0)
          ).toFixed(2),
        });
      });
    }

    // Calculate total amount
    const totalAmount = pvAdaptors.reduce(
      (sum, item) => sum + parseFloat(item.totalAmount),
      0
    );

    // Update VK quotation
    await client.query(
      `
      UPDATE vk_quotations SET
        quotation_number = $1,
        quotation_date = $2,
        reference_no = $3,
        valid_until = $4,
        currency = $5,
        payment_terms = $6,
        delivery_duration = $7,
        company_name = $8,
        company_email = $9,
        company_gst = $10,
        company_address = $11,
        client_name = $12,
        client_email = $13,
        client_phone = $14,
        gstterms = $15,
        packaging = $16,
        insurance = $17,
        deliveryTerms = $18,
        kiet_costs = $19,
        pv_adaptors = $20,
        total_amount = $21,
        notes = $22,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $23
    `,
      [
        quotationNumber,
        quotationDate,
        referenceNo,
        validUntil,
        currency,
        paymentTerms,
        deliveryDuration,
        companyName,
        companyEmail,
        companyGST,
        companyAddress,
        clientName,
        clientEmail,
        clientPhone,
        gstterms,
        packaging,
        insurance,
        deliveryTerms,
        JSON.stringify(kietCosts),
        JSON.stringify(pvAdaptors),
        totalAmount,
        notes,
        id,
      ]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "VK quotation updated successfully",
      quotationId: id,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating VK quotation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update VK quotation",
    });
  } finally {
    client.release();
  }
});

// Route to regenerate VK quotation PDF
app.post("/regenerate-vk-pdf/:id", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  try {
    const { id } = req.params;
    const client = await pool.connect();

    // Fetch updated quotation data
    const quotationResult = await client.query(
      `
      SELECT * FROM vk_quotations WHERE id = $1
    `,
      [id]
    );

    client.release();

    if (quotationResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "VK quotation not found" });
    }

    const quotation = quotationResult.rows[0];

    // Prepare data for PDF generation
    const poData = {
      company: {
        logo: path.join(__dirname, "public", "images", "page_logo.jpg"),
        name: quotation.company_name || "",
        email: quotation.company_email || "",
        gst: quotation.company_gst || "",
        address: quotation.company_address || "",
      },
      supplier: {
        address: quotation.client_address || "",
        contact: quotation.client_phone || "",
        duration: quotation.delivery_duration || "",
      },
      clientEmail: quotation.client_email,
      poNumber: quotation.quotation_number || "",
      date: quotation.quotation_date || "",
      requester: { name: quotation.client_name || "" },
      reference_no: quotation.reference_no || "",
      expected_date: quotation.valid_until || "",
      termsOfPayment: quotation.payment_terms || "",
      gstterms: quotation.gstterms || "Extra 18%",
      insurance: quotation.insurance || "N/A",
      deliveyt: quotation.deliveryTerms || "",
      package: quotation.packaging || "",
      currency: quotation.currency || "INR",
      kietCosts: quotation.kiet_costs ? JSON.parse(quotation.kiet_costs) : [],
      pvAdaptors: quotation.pv_adaptors
        ? JSON.parse(quotation.pv_adaptors)
        : [],
      line: path.join(__dirname, "public", "images", "line.png"),
      signPath: path.join(__dirname, "public", "images", "signature.png"),
    };

    const sanitizedNumber = (quotation.quotation_number || "temp").replace(
      /[^a-zA-Z0-9.-]/g,
      "_"
    );
    const filePath = path.join(
      qtUploadsDir,
      `quotation_${sanitizedNumber}.pdf`
    );

    await generateVKQuotation(poData, filePath);

    res.json({
      success: true,
      message: "VK quotation PDF regenerated successfully",
      filePath: `/qt_uploads/quotation_${sanitizedNumber}.pdf`,
    });
  } catch (error) {
    console.error("Error regenerating VK PDF:", error);
    res.status(500).json({
      success: false,
      error: "Failed to regenerate VK quotation PDF",
    });
  }
});

app.get("/view-quotation/:param", async (req, res) => {
  try {
    const { param } = req.params;
    const isNumeric = /^\d+$/.test(param);

    const quotationResult = await pool.query(
      `SELECT * FROM quotations WHERE ${isNumeric ? "id" : "quotation_number"} = $1 LIMIT 1`,
      [param]
    );

    if (quotationResult.rows.length === 0) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    const quotation = quotationResult.rows[0];

    // Fetch items
    const itemsQuery = `
      SELECT part_no, description, hsn_code, quantity, unit, unit_price, total_amount
      FROM quotation_items
      WHERE quotation_id = $1
      ORDER BY id ASC;
    `;
    const items = (await pool.query(itemsQuery, [quotation.id])).rows || [];

    // Build poData
    const poData = {
      poNumber: quotation.quotation_number,
      date: quotation.quotation_date ? quotation.quotation_date.toLocaleDateString("en-GB") : "",
      expected_date: quotation.valid_until ? quotation.valid_until.toLocaleDateString("en-GB") : "",
      termsOfPayment: quotation.payment_terms || "",
      currency: quotation.currency || "INR",
      requester: { name: quotation.client_name || "" },
      reference_no: quotation.reference_no,
      company: {
        name: quotation.company_name || "KIET TECHNOLOGIES PRIVATE LIMITED",
        email: quotation.company_email || "info@kiet.com",
        gst: quotation.company_gst || "29AAFCK6528DIZG",
        address:
          quotation.company_address ||
          "51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd",
        logo: path.join(process.cwd(), "public/images/page_logo.jpg"),
      },
      supplier: {
        name: quotation.client_name,
        address: quotation.client_address || "",
        duration: quotation.delivery_duration || "",
        contact: quotation.client_phone || "",
      },
      gstterms: quotation.gst || "Extra 18%",
      insurance: quotation.insurance || "N/A",
      delivery_terms: quotation.delivery_terms || "Ex-Works / DAP",
      packaging: quotation.packaging || "Standard Export Packaging extra",
      line: path.join(process.cwd(), "public/images/line.png"),
      signPath: path.join(process.cwd(), "public/images/signature.png"),
      items,
    };

    const fileName = `quotation_${poData.poNumber}_${Date.now()}.pdf`;
    const filePath = path.join(qtUploadsDir, fileName);

    await generateQuotation(poData, filePath);

    // === 🔥 OPEN PDF IN BROWSER INSTEAD OF DOWNLOADING ===
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${fileName}"`
    );
    res.setHeader("Content-Type", "application/pdf");

    return res.sendFile(filePath);
  } catch (error) {
    console.error("❌ Error in /view-quotation:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/view-vk-quotation/:param", async (req, res) => {
  try {
    const { param } = req.params;
    const isNumeric = /^\d+$/.test(param);

    const quotationResult = await pool.query(
      `SELECT * FROM vk_quotations WHERE ${isNumeric ? "id" : "quotation_number"} = $1 LIMIT 1`,
      [param]
    );

    if (quotationResult.rows.length === 0) {
      return res.status(404).json({ error: "VK Quotation not found" });
    }

    const quotation = quotationResult.rows[0];
    const kietCosts = typeof quotation.kiet_costs === "string" ? JSON.parse(quotation.kiet_costs) : (quotation.kiet_costs || []);
const pvAdaptors = typeof quotation.pv_adaptors === "string" ? JSON.parse(quotation.pv_adaptors) : (quotation.pv_adaptors || []);


    const poData = {
      company: {
        logo: path.join(process.cwd(), "public/images/page_logo.jpg"),
        name: quotation.company_name || "KIET TECHNOLOGIES PRIVATE LIMITED",
        email: quotation.company_email || "info@kiet.com",
        gst: quotation.company_gst || "29AAFCK6528DIZG",
        address: quotation.company_address || "51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd",
      },
      supplier: {
        address: quotation.client_address || "",
        contact: quotation.client_phone || "",
        duration: quotation.delivery_duration || "",
      },
      clientEmail: quotation.client_email,
      poNumber: quotation.quotation_number,
      date: quotation.quotation_date ? quotation.quotation_date.toLocaleDateString("en-GB") : "",
      requester: { name: quotation.client_name || "" },
      reference_no: quotation.reference_no,
      expected_date: quotation.valid_until ? quotation.valid_until.toLocaleDateString("en-GB") : "",
      termsOfPayment: quotation.payment_terms || "",
      gstterms: quotation.gstterms || "Extra 18%",
      insurance: quotation.insurance || "N/A",
      deliveyt: quotation.deliveryterms || "Ex-Works / DAP",
      package: quotation.packaging || "Standard Export Packaging extra",
      currency: quotation.currency || "INR",
      kietCosts,
      pvAdaptors,
      line: path.join(process.cwd(), "public/images/line.png"),
      signPath: path.join(process.cwd(), "public/images/signature.png"),
    };

    const fileName = `vk_quotation_${poData.poNumber}_${Date.now()}.pdf`;
    const filePath = path.join(qtUploadsDir, fileName);

    await generateVKQuotation(poData, filePath);

    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Type", "application/pdf");

    return res.sendFile(filePath);
  } catch (error) {
    console.error("❌ Error in /view-vk-quotation:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/view-mae-quotation/:param", async (req, res) => {
  try {
    const { param } = req.params;
    const isNumeric = /^\d+$/.test(param);

    const quotationResult = await pool.query(
      `SELECT * FROM mae_quotations WHERE ${isNumeric ? "id" : "quotationnumber"} = $1 LIMIT 1`,
      [param]
    );
    

    if (quotationResult.rows.length === 0) {
      return res.status(404).json({ error: "MAE Quotation not found" });
    }

    const quotation = quotationResult.rows[0];
    console.log('quotation details is down there',quotation);

    const poData = {
      company: {
        logo: path.join(process.cwd(), "public/images/page_logo.jpg"),
        name: quotation.companyname || "KIET TECHNOLOGIES PRIVATE LIMITED",
        email: quotation.clientemail || "info@kiet.com",
        gst: "29AAFCK6528D1ZG", // Fixed GST as per mae.js
        contact:quotation.clientphone || " ",
        address: quotation.companyaddress || "51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111",
      },
      poNumber: quotation.quotationnumber,
      date: quotation.quotationdate ? new Date(quotation.quotationdate).toLocaleDateString("en-GB") : "",
      expected_date: quotation.validuntil ? new Date(quotation.validuntil).toLocaleDateString("en-GB") : "",
      termsOfPayment: quotation.maepaymentterms || "",
      currency: quotation.currency || "INR",
      requester: { name: quotation.clientname || "" },
      clientEmail: quotation.clientemail || "",
      textareaDetails: quotation.textarea_details || "",
      gstterms: quotation.maegstterms || "",
      insurance: quotation.maeinsurance || "",
      packaging: quotation.packaging || "",
      machine:quotation.subject||"",
      warranty: quotation.maewarranty || "",
      line: path.join(process.cwd(), "public/images/line.png"),
      signPath: path.join(process.cwd(), "public/images/signature.png"),
    };

    const fileName = `mae_quotation_${poData.poNumber}_${Date.now()}.pdf`;
    const filePath = path.join(qtUploadsDir, fileName);

    await generateMAEQuotation(poData, filePath);

    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Type", "application/pdf");

    return res.sendFile(filePath);
  } catch (error) {
    console.error("❌ Error in /view-mae-quotation:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Download MAE quotation PDF


app.get("/download-mae-quotation/:param", async (req, res) => {
  try {
    const { param } = req.params;
    const isNumeric = /^\d+$/.test(param);

    const column = isNumeric ? "id" : "quotationnumber";
    const quotationResult = await pool.query(
      `SELECT * FROM mae_quotations WHERE ${column} = $1 LIMIT 1`,
      [param]
    );

    if (quotationResult.rows.length === 0) {
      return res.status(404).json({ error: "MAE Quotation not found" });
    }
    

    const q = quotationResult.rows[0];
    console.log("hjk",q)

    const poData = {
      company: {
        logo: path.join(process.cwd(), "public/images/page_logo.jpg"),
        name: q.companyname || "KIET TECHNOLOGIES PRIVATE LIMITED",
        email: q.clientemail || "info@kiet.com",
        gst: "29AAFCK6528D1ZG",
        contact: q.clientphone || "",
        address:
          q.companyaddress ||
          "51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111"
      },
      poNumber: q.quotationnumber,
      date: q.quotationdate ? new Date(q.quotationdate).toLocaleDateString("en-GB") : "",
      expected_date: q.validuntil ? new Date(q.validuntil).toLocaleDateString("en-GB") : "",
      termsOfPayment: q.maepaymentterms || "",
      currency: q.currency || "INR",
      requester: { name: q.clientname || "" },
      clientEmail: q.clientemail || "",
      machine: q.subject || "",
      warranty: q.maewarranty || "",
      gstterms: q.maegstterms || "",
      textareaDetails: q.textarea_details || "",
      packaging:q.maepackaging || " ",
      insurance: q.maeinsurance || "",
      line: path.join(process.cwd(), "public/images/line.png"),
      signPath: path.join(process.cwd(), "public/images/signature.png")
    };

    // Save inside qt_uploads without subfolders
    // Remove null, undefined, or empty values
let safeNumber = poData.poNumber;

// If null/undefined/empty → use ID or a random short code
if (!safeNumber) {
  safeNumber = q.id ? `ID-${q.id}` : `AUTO-${Date.now()}`;
}

const fileName = `mae_quotation_${safeNumber}_${Date.now()}.pdf`;

    const filePath = path.join(qtUploadsDir, fileName);

    // Make sure directory exists
    if (!fs.existsSync(qtUploadsDir)) {
      fs.mkdirSync(qtUploadsDir, { recursive: true });
    }

    // --- 4) GENERATE PDF ---
    await generateMAEQuotation(poData, filePath);

    // --- 5) STREAM FILE (Inline Preview Mode) ---
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Type", "application/pdf");

    res.sendFile(filePath, async (err) => {
      if (err) {
        console.error("SendFile Error:", err);
        return res.status(500).json({ error: "Failed to send the PDF." });
      }

      // --- 6) CLEAN UP TEMP FILE ---
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {
        console.warn("Could not remove temp PDF:", e.message);
      }
    });

  } catch (error) {
    console.error("❌ Error in /download-mae-quotation:", error);
    return res.status(500).json({ error: error.message });
  }
});



// Preview VK quotation from form data
app.post("/preview-vk", upload.none(), async (req, res) => {
  try {
    const formData = req.body || {};

    // Process form data similar to generate-quotation for VK
    const quotationNumber = formData.quotationNumber || "PREVIEW";

    // Process PV Wiring Adaptor Details and KIET Costs
    let pvAdaptors = [];
    let kietCosts = [];

    if (formData["itemDescription"] && Array.isArray(formData["itemDescription"])) {
      formData["itemDescription"].forEach((desc, index) => {
        const cost = parseFloat(formData["priceInput"][index]) || 0;
        const qty = parseFloat(formData["qtyInput"][index]) || 0;

        kietCosts.push({
          description: desc,
          cost: cost,
          qty: qty,
          totalValue: (cost * qty).toFixed(2),
        });
      });

      // Calculate total for user inputs
      const kietTotal = kietCosts.reduce((sum, item) => sum + parseFloat(item.totalValue), 0).toFixed(2);

      // Add total row
      kietCosts.push({
        description: `Total costs in ${formData.currency || "INR"} (qty of 1 No.)`,
        cost: kietTotal,
        qty: 1,
        totalValue: kietTotal,
        colSpan: 3,
        isSummaryRow: true,
      });

      // Add additional fixed rows
      const priceInputs = formData["priceInput"] || [];

      kietCosts.push({
        description: "Export packaging charges included",
        cost: priceInputs[4] || "2650",
        qty: "",
        totalValue: priceInputs[4] || "2650",
        colSpan: 3,
        isSummaryRow: true,
      });

      kietCosts.push({
        description: "Bigger box setup",
        cost: priceInputs[5] || "",
        qty: "",
        totalValue: priceInputs[5] || "",
        colSpan: 3,
        isSummaryRow: true,
      });

      const a = Number(priceInputs[5] || 0);
      const b = Number(priceInputs[4] || 0);
      const c = Number(kietTotal || 0);

      const total = a + b + c;
      kietCosts.push({
        description: "Total Cost",
        cost: total || " ",
        qty: "",
        totalValue: total || "",
        colSpan: 3,
        isSummaryRow: true,
      });
    }

    if (formData["pvQty"] && Array.isArray(formData["pvQty"])) {
      formData["pvQty"].forEach((qty, index) => {
        pvAdaptors.push({
          slNo: index + 1,
          qty: parseFloat(qty) || 0,
          familyName: formData["pvFamilyName"][index] || "",
          revNo: formData["pvRevNo"][index] || "",
          coaxialPin: formData["pvCoaxialPin"][index] || "",
          sokCard: formData["pvSokCard"][index] || "",
          sokQty: parseFloat(formData["pvSokQty"][index]) || 0,
          rate: parseFloat(formData["pvRate"][index]) || 0,
          totalAmount: (parseFloat(qty) * parseFloat(formData["pvRate"][index] || 0)).toFixed(2),
        });
      });
    }

    // Prepare data for PDF
    const poData = {
      company: {
        logo: path.join(__dirname, "public/images/page_logo.jpg"),
        name: formData.companyName || "",
        email: formData.companyEmail || "",
        gst: formData.companyGST || "",
        address: formData.companyAddress || "",
      },
      supplier: {
        address: formData.clientAddress || "",
        contact: formData.clientPhone || "",
        duration: formData.deliveryDuration || "",
      },
      clientEmail: formData.clientEmail || "",
      poNumber: quotationNumber,
      date: formData.quotationDate || "",
      requester: { name: formData.clientName || "" },
      reference_no: formData.referenceNo || "",
      expected_date: formData.validUntil || "",
      termsOfPayment: formData.paymentTerms || "",
      gstterms: formData.gst || "Extra 18%",
      insurance: formData.insurance || "N/A",
      deliveyt: formData.deliveryTerms || "",
      package: formData.packaging || "",
      currency: formData.currency || "INR",
      kietCosts,
      pvAdaptors,
      line: path.join(__dirname, "public/images/line.png"),
      signPath: path.join(__dirname, "public/images/signature.png"),
    };

    const fileName = `vk_preview_${Date.now()}.pdf`;
    const filePath = path.join(qtUploadsDir, fileName);

    await generateVKQuotation(poData, filePath);

    // Open PDF in browser
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Type", "application/pdf");

    return res.sendFile(filePath);
  } catch (error) {
    console.error("❌ Error in /preview-vk:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/preview", upload.none(), async (req, res) => {
  try {
    const formData = req.body || {};
    console.log("formdatat",formData)

    // Prepare data for MAE PDF generation
    const poData = {
      company: {
        logo: path.join(__dirname, "public/images/page_logo.jpg"),
        name: formData.companyName || "KIET TECHNOLOGIES PRIVATE LIMITED",
        email: formData.clientEmail || "info@kiet.com",
        gst: "29AAFCK6528D1ZG",
        contact: formData.clientPhone || "",
        address: formData.companyAddress || "51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111",
      },
      poNumber: formData.quotationNumber || "PREVIEW",
      date: formData.quotationDate || "",
      expected_date: formData.validUntil || "",
      termsOfPayment: formData.maePaymentTerms || "",
      currency: formData.currency || "INR",
      requester: { name: formData.clientName || "" },
      clientEmail: formData.clientEmail || "",
      textareaDetails: formData.textarea_details || "",
      gstterms: formData.maeGstTerms || "",
      insurance: formData.maeInsurance || "",
      packaging:formData.maePackaging || " ",
      machine: formData.subject || "",
      warranty: formData.maeWarranty || "",
      line: path.join(__dirname, "public/images/line.png"),
      signPath: path.join(__dirname, "public/images/signature.png"),
    };

    const fileName = `mae_preview_${Date.now()}.pdf`;
    const filePath = path.join(qtUploadsDir, fileName);

    await generateMAEQuotation(poData, filePath);

    // Open PDF in browser for preview
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Type", "application/pdf");

    return res.sendFile(filePath);
  } catch (error) {
    console.error("❌ Error in /preview:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/update-vk-quotation_md/:id", upload.none(), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;

    // ---- Parse PV ADAPTORS ----
    let pvAdaptors = [];
    if (Array.isArray(req.body.pvQty)) {
      req.body.pvQty.forEach((qty, index) => {
        pvAdaptors.push({
          slNo: index + 1,
          qty: parseFloat(qty) || 0,
          familyName: req.body.pvFamilyName[index] || "",
          revNo: req.body.pvRevNo[index] || "",
          coaxialPin: req.body.pvCoaxialPin[index] || "",
          sokCard: req.body.pvSokCard[index] || "",
          sokQty: parseFloat(req.body.pvSokQty[index]) || 0,
          rate: parseFloat(req.body.pvRate[index]) || 0,
          totalAmount: (
            (parseFloat(qty) || 0) *
            (parseFloat(req.body.pvRate[index]) || 0)
          ).toFixed(2),
        });
      });
    }

    // ---- Calculate total ----
    const totalAmount = pvAdaptors.reduce(
      (sum, item) => sum + parseFloat(item.totalAmount),
      0
    );
    console.log('vk revision rev', req.body.quotation_rev)
    console.log("Total Amount:", totalAmount);
    console.log("PV Adaptors:", pvAdaptors);

    // ---- UPDATE ONLY PV ADAPTORS ----
    await client.query(
      `
      UPDATE vk_quotations SET
       
        pv_adaptors = $1,
        total_amount = $2,
        updated_at = CURRENT_TIMESTAMP,quotation_numb=$3
      WHERE id = $4
      `,
      [JSON.stringify(pvAdaptors), totalAmount,req.body.quotation_rev, id]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "PV Adaptor details updated successfully",
      quotationId: id,
      totalAmount
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating VK quotation:", error);
    res.status(500).json({ success: false, error: "Update failed" });
  } finally {
    client.release();
  }
});




app.get('/generate_quotation_mae',async(req,res)=>{
   const client = await pool.connect();
  await client.query("BEGIN");
   const resp=await client.query(`SELECT generate_quotation_number_mae()`)
   res.json({quotation_number:resp.rows[0].generate_quotation_number_mae})
   client.release()

  
});
app.post("/api/sendApproval/mae",upload.none(),async(req,res)=>{
  const{
   quotationNumber,
   quotationDate,
   validUntil,
   currency,
   companyName,
   companyAddress,
   clientName,
   clientEmail,
   clientPhone,
   textarea_details,
   maePaymentTerms,
   maeGstTerms,
   maeInsurance,
   maeWarranty,
   maePackaging,
   
   subject,
   createdBy

  }=req.body;
  console.log(req.body);
  const client = await pool.connect();
  try{
   await client.query("BEGIN");
   const maeQut=`
   INSERT INTO mae_quotations(
   quotationNumber,
   quotationDate,
   validUntil,
   currency,
   companyName,
   companyAddress,
   clientName,
   clientEmail,
   clientPhone,
   textarea_details,
   maePaymentTerms,
   maeGstTerms,
   maeInsurance,
   maeWarranty,
   status,
   subject,created_by
   ,maepackaging
   ) VALUES( $1, $2, $3, $4,
       $5, $6, $7, $8, $9,
       $10, $11, $12, $13,
       $14, $15, $16,$17,$18) RETURNING id`;
   const maeValues=[
     quotationNumber,
   quotationDate,
   validUntil,
   currency,
   companyName,
   companyAddress,
   clientName,
   clientEmail,
   clientPhone,
   textarea_details,
   maePaymentTerms,
   maeGstTerms,
   maeInsurance,
   maeWarranty,
   "pending",
   subject,
   createdBy,
   maePackaging

   ];
   const result=await client.query(maeQut,maeValues);
   console.log(req.body);
   await client.query("COMMIT");

     res.status(200).json({
       success: true,
       id: result.rows[0].id,
       message: "Quotation saved successfully",
     });
  const transporter = nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        auth: {
          user: "No-reply@kietsindia.com",
          pass: "process.env.NO_PASSWORD",
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const mailOptions = {
        from: "No-reply@kietsindia.com",
        to: "chandrashekaraiah.r@kietsindia.com", // MD email
        subject: `Quotation Approval Required: ${quotationNumber}`,
       
              
  html: `
   
     
    <div style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 10px;">

  <div style="max-width: 620px; margin: auto; background: #ffffff; padding: 10px 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">

    <p style="font-size: 15px; color: #333; line-height: 1.7;"><strong>Dear MD Sir,</strong></p>

    <p style="font-size: 15px; color: #444; line-height: 1.5;" >
      We wish to notify you that a new Purchase Order has been prepared and is now awaiting your Final approval.<br>
      Please find the summary details below for your reference:
    </p>

    <table cellpadding="10" cellspacing="0" 
       style="margin: 18px 0; font-size: 14px; border-collapse: collapse; width: 100%; background: #fafafa; border-radius: 6px; border: 1px solid #ccc;">

      <tr>
        <td style="border-bottom: 1px solid #e6e6e6; width: 40%;"><strong>Quotation Number:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${quotationNumber}</td>
      </tr>
       <tr>
        <td style="border-bottom: 1px solid #e6e6e6; width: 40%;"><strong>Quotation Type:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${companyName}</td>
      </tr>
    
      <tr>
        <td style="border-bottom: 1px solid #e6e6e6;"><strong>Client Name:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${clientName}}</td>
      </tr>
      <tr>
        <td style="border-bottom: 1px solid #e6e6e6;"><strong>Submitted By:</strong></td>
        <td style="border-bottom: 1px solid #e6e6e6;">${req.session.user ? req.session.user.email : "Unknown"}</td>
      </tr>
     

      <tr>
        <td><strong>Submission Date:</strong></td>
        <td> ${quotationDate}</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://kietprocure.com/"
        style="background: #0056b3; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block;">
        Review Quotation(MAE)
      </a>
    </div>
  

    
  
  <div style="text-align: center; padding: 20px; border-top: 1px solid #ddd;">
      <img src="cid:logoImage" alt="Company Logo"
        style="width: 90px; height: auto; margin-bottom: 10px;" />

      <div style="font-size: 16px; font-weight: bold; color: #000;">
        KIET TECHNOLOGIES PVT LTD
      </div>

      <div style="font-size: 13px; margin-top: 5px;">
        📍 51/33, Aaryan Techpark, 3rd cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru, Karnataka 560111
      </div>

      <div style="font-size: 13px; margin-top: 5px;">
        📞 +91 98866 30491 &nbsp;|&nbsp; ✉️ info@kietsindia.com &nbsp;|&nbsp;
        🌐 <a href="https://kietsindia.com" style="color:#0066cc; text-decoration:none;">kietsindia.com</a>
      </div>

      <!-- Social Icons -->
      <div style="margin-top: 12px;">
        <a href="https://facebook.com" style="margin: 0 6px;">
          <img src="cid:fbIcon" width="22" />
        </a>
        <a href="https://linkedin.com/company" style="margin: 0 6px;">
          <img src="cid:lkIcon" width="22" />
        </a>
        <a href="https://instagram.com" style="margin: 0 6px;">
          <img src="cid:igIcon" width="22" />
        </a>
        <a href="https://kietsindia.com" style="margin: 0 6px;">
          <img src="cid:webIcon" width="22" />
        </a>
      </div>

      <div style="font-size: 11px; color: #777; margin-top: 15px;">
        © 2025 KIET TECHNOLOGIES PVT LTD — All Rights Reserved.
      </div>
    </div>
  </div>























</div>



    </div>
</div>


    

   
    
  `,
        attachments: [
          {
            filename: "lg.jpg",
            path: "public/images/lg.jpg",
            cid: "logoImage",
          },
        ],
      };
      // try {
      //   const info = await transporter.sendMail(mailOptions);
      //   console.log("✅ Approval request email sent to MD:", info.response);
      // } catch (err) {
      //   console.error("❌ Email failed:", err);
      // }


  }
  catch(error){
    await client.query("ROLLBACK");
       console.error("Error saving quotation:", error);
       res.status(500).json({
         success: false,
         error: "Failed to save quotation",
         details: error.message,
       });


  }
   finally {
       client.release();
     }


});

// Get all MAE quotations
app.get("/api/mae-quotations", async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        id,
        quotationnumber,
        quotationdate,
        validuntil,
        currency,
        companyname,
        companyaddress,
        clientname,
        clientemail,
        clientphone,
        textarea_details,
        maepaymentterms,
        maegstterms,
        maeinsurance,
        maewarranty,
        status,
        created_at,
        updated_at,
        created_by
      FROM mae_quotations
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching MAE quotations:", error);
    res.status(500).json({ error: "Failed to fetch MAE quotations" });
  } finally {
    client.release();
  }
});

// Get single MAE quotation by ID
app.get("/api/mae-quotations/:id", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        id,
        quotationnumber,
        quotationdate,
        validuntil,
        currency,
        companyname,
        companyaddress,
        clientname,
        clientemail,
        clientphone,
        textarea_details,
        maepaymentterms,
        maegstterms,
        maeinsurance,
        maewarranty,
        status,
        created_at,
        updated_at,
        created_by
      FROM mae_quotations
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "MAE quotation not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching MAE quotation:", error);
    res.status(500).json({ error: "Failed to fetch MAE quotation" });
  } finally {
    client.release();
  }
});

// Update MAE quotation
app.put("/api/mae-quotations/:id", upload.none(), async (req, res) => {
  const { id } = req.params;
  const {
    quotationNumber,
    quotationDate,
    validUntil,
    currency,
    companyName,
    companyAddress,
    clientName,
    clientEmail,
    clientPhone,
    textarea_details,
    maePaymentTerms,
    maeGstTerms,
    maeInsurance,
    maeWarranty,
    status
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updateQuery = `
      UPDATE mae_quotations SET
        quotationnumber = $1,
        quotationdate = $2,
        validuntil = $3,
        currency = $4,
        companyname = $5,
        companyaddress = $6,
        clientname = $7,
        clientemail = $8,
        clientphone = $9,
        textarea_details = $10,
        maepaymentterms = $11,
        maegstterms = $12,
        maeinsurance = $13,
        maewarranty = $14,
        status = $15,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16
      RETURNING *
    `;

    const values = [
      quotationNumber,
      quotationDate,
      validUntil,
      currency,
      companyName,
      companyAddress,
      clientName,
      clientEmail,
      clientPhone,
      textarea_details,
      maePaymentTerms,
      maeGstTerms,
      maeInsurance,
      maeWarranty,
      status,
      id
    ];

    const result = await client.query(updateQuery, values);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "MAE quotation not found" });
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "MAE quotation updated successfully",
      quotation: result.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating MAE quotation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update MAE quotation",
      details: error.message
    });
  } finally {
    client.release();
  }
});

// app.post("/api/sendApproval/mae", upload.none(), (req, res) => {
//   console.log("formatted data:", req.body);
//   res.json({ message: "Received form data", data: req.body });
// });

// Get approved MAE quotations
app.get("/api/mae-quotations/get/approved/:by", async (req, res) => {
  console.log('lparams',req.params);
  const user= req.params.by;
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        id,
        quotationnumber ,
        quotationdate ,
        validuntil ,
        currency,
        companyname,
        companyaddress, 
        clientname ,
        clientemail, 
        clientphone ,
        textarea_details ,
        maepaymentterms as paymentterms ,
        maegstterms ,
        maeinsurance ,
        maewarranty ,
        status,
        created_at,
        updated_at,
        created_by
      FROM mae_quotations
      WHERE LOWER(status::text) = 'approved' and created_by= $1
      ORDER BY created_at DESC
    `,[user]
);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("SQL ERROR:", error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});


// Update MAE quotation status (approve/reject)
app.put("/api/mae-quotations/:id/:status", async (req, res) => {
  const { id, status } = req.params;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be 'approved' or 'rejected'" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Update the status
    const updateQuery = `
      UPDATE mae_quotations
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await client.query(updateQuery, [status, id]);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "MAE quotation not found" });
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `MAE quotation ${status} successfully`,
      quotation: result.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating MAE quotation status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update MAE quotation status",
      details: error.message
    });
  } finally {
    client.release();
  }
});

// Get project assignments
app.post(
  "/api/project-details",
  upload.single('po_upload'),   // 👈 matches input name
  async (req, res) => {
    try {
      const {
        invoiceNo,
        invoiceDate,
        invType,
        customer,
        userName,
        projectCode,
        description,
        poNo,
        poDate,
        deliveryDate,
        deliveryStatus,
        quantity,
        valuePerUnit,
        baseValue,
        totalValue,
        totalPoValuePending,
        currency
      } = req.body;
      

      const poFilePath = req.file ? req.file.path : null;

      const query = `
        INSERT INTO project_info (
          invoice_no,
          invoice_date,
          inv_type,
          customer,
          user_name,
          project_code,
          description,
          po_no,
          po_date,
          delivery_date,
          delivery_status,
          quantity,
          value_per_unit,
          base_value,
          total_value,
          total_po_value_pending,
          currency,
          po_file
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
        ) RETURNING *;
      `;

      const values = [
        invoiceNo || null,
        invoiceDate || null,
        invType || null,
        customer,
        userName,
        projectCode,
        description,
        poNo,
        poDate,
        deliveryDate || null,
        deliveryStatus,
        quantity,
        valuePerUnit,
        baseValue || null,
        totalValue || null,
        totalPoValuePending || null,
        currency,
        poFilePath
      ];

      const result = await pool.query(query, values);
      console.log('Inserted project details:', result.rows[0]);
      console.log('PO file path:', poFilePath);
      console.log('Request body:', req.body);

      res.status(201).json({
        success: true,
        message: "Project details inserted successfully",
        data: result.rows[0]
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Error inserting project details",
        error: error.message
      });
    }
  }
);





app.post("/md/mae_generation", upload.none(), async (req, res) => {
  const {
    quotationNumber,
    quotationDate,
    validUntil,
    currency,
    companyName,
    companyAddress,
    clientName,
    clientEmail,
    clientPhone,
    textareaDetails,
    maePaymentTerms,
    maeGstTerms,
    maeInsurance,
    maeWarranty,
    subject,
    maePackaging
  } = req.body;

  console.log(req.body);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const maeQut = `
      INSERT INTO mae_quotations (
        quotationNumber, quotationDate, validUntil, currency,
        companyName, companyAddress, clientName, clientEmail,
        clientPhone, textarea_details, maePaymentTerms, maeGstTerms,
        maeInsurance, maeWarranty, status, subject,maepackaging
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,$17
      ) RETURNING *`;

    const maeValues = [
      quotationNumber,
      quotationDate,
      validUntil,
      currency,
      companyName,
      companyAddress,
      clientName,
      clientEmail,
      clientPhone,
      textareaDetails,
      maePaymentTerms,
      maeGstTerms,
      maeInsurance,
      maeWarranty,
      "approved",
      subject,
      maePackaging
    ];

    const result = await client.query(maeQut, maeValues);
    const quotation = result.rows[0];

    await client.query("COMMIT");

    // ⏬ AFTER SAVE → GENERATE PDF
    const poData = {
      company: {
        logo: path.join(process.cwd(), "public/images/page_logo.jpg"),
        name: quotation.companyname || "KIET TECHNOLOGIES PRIVATE LIMITED",
        email: quotation.clientemail || "info@kiet.com",
        gst: "29AAFCK6528D1ZG",
        contact: quotation.clientphone || "",
        address: quotation.companyaddress || "51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout, Bengaluru - 560111",
      },
      poNumber: quotation.quotationnumber,
      date: quotation.quotationdate ? new Date(quotation.quotationdate).toLocaleDateString("en-GB") : "",
      expected_date: quotation.validuntil ? new Date(quotation.validuntil).toLocaleDateString("en-GB") : "",
      termsOfPayment: quotation.maepaymentterms || "",
      currency: quotation.currency || "INR",
      requester: { name: quotation.clientname || "" },
      clientEmail: quotation.clientemail || "",
      textareaDetails: quotation.textarea_details || "",
      gstterms: quotation.maegstterms || "",
      insurance: quotation.maeinsurance || "",
      machine: quotation.subject || "",
      packaging:quotation.maepackaging || "",
      warranty: quotation.maewarranty || "",
      line: path.join(process.cwd(), "public/images/line.png"),
      signPath: path.join(process.cwd(), "public/images/signature.png"),
    };

    const fileName = `mae_quotation_${poData.poNumber}_${Date.now()}.pdf`;
    const filePath = path.join(qtUploadsDir, fileName);

    await generateMAEQuotation(poData, filePath);

    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Type", "application/pdf");
    return res.sendFile(filePath);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error in MAE generation:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to save quotation",
      details: error.message,
    });
  } finally {
    client.release();
  }
});
// =============================
// TINYMCE IMAGE UPLOAD ROUTE
// =============================
app.post("/upload_image", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // 🔥 USE YOUR LIVE DOMAIN HERE (must include https://)
    const BASE_URL = "https://kietprocure.com";

    const fileURL = `${BASE_URL}/uploads/${req.file.filename}`;

    return res.json({ location: fileURL }); // 👈 TinyMCE expects {location:"url"}
  } catch (error) {
    console.error("❌ TinyMCE Upload Error:", error);
    return res.status(500).json({ error: "Image upload failed" });
  }
});
app.get('/dc_approve',(req,res)=>{
  res.render('dc.ejs');
});
app.get("/generate-challan-no", async (req, res) => {
    try {
        const result = await pool.query("SELECT generate_dc_challan_no() AS challan_no");
        res.json({ success: true, challan_no: result.rows[0].challan_no });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});
app.post("/submit-delivery-challan", async (req, res) => {
    try {
        const data = req.body;
        const requester = req.session.user ? req.session.user.email : null;

        // Insert the challan
        const result = await pool.query(
            `INSERT INTO delivery_challan
            (challan_no, challan_date, delivery_date, vehicle_no,
             consignor_name, consignor_gst, consignor_address,
             consignee_name, consignee_gst, consignee_address,
             consignee_contact, consignee_phone, reason,
             dc_type, expiry_date, escalation_status,
             manager_email, approval_status, requester)

             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                     $14,$15,$16,$17,'pending',$18)
             RETURNING id`,
            [
                data.challanNumber,
                data.challanDate,
                data.deliveryDate,
                data.vehicleNumber,

                data.consignorName,
                data.consignorGST,
                data.consignorAddress,

                data.consigneeName,
                data.consigneeGST,
                data.consigneeAddress,
                data.consigneeContact,
                data.consigneePhone,
                data.reason,

                data.dcType,
                data.expiryDate || null,
                data.escalationStatus || "NORMAL",

                data.managerEmail,
                requester
            ]
        );

        const challan_id = result.rows[0].id;

        // Insert item rows
        for (let i = 0; i < data.partNo.length; i++) {
            await pool.query(
                `INSERT INTO delivery_challan_items 
                (challan_id, part_no, description, hsn, quantity, unit, remarks)
                VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [
                    challan_id,
                    data.partNo[i],
                    data.description[i],
                    data.hsn[i],
                    data.quantity[i],
                    data.unit[i],
                    data.remarks[i]
                ]
            );
        }

        // Send approval email to manager
        const approvalLink = `https://kietprocure.com/approve-dc/${challan_id}`;
        const transporter = nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        auth: {
          user: "No-reply@kietsindia.com",
          pass: "process.env.NO_PASSWORD",
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

        await transporter.sendMail({
  from: "No-reply@kietsindia.com",
  to: data.managerEmail,
  subject: "Delivery Challan Approval Required",
  html: `
    <div style="font-family:Arial,sans-serif;">
      <h3>Delivery Challan Approval Required</h3>
      <p><strong>Challan No:</strong> ${data.challanNumber}</p>

      <a href="${approvalLink}"
         style="
           padding:12px 24px;
           background:#0d6efd;
           color:white;
           text-decoration:none;
           border-radius:4px;
           display:inline-block;
         ">
        👁 VIEW DELIVERY CHALLAN
      </a>

      <p style="margin-top:15px;color:#555;">
        Please review the PDF before approving.
      </p>
    </div>
  `
});


        res.json({ success: true, challan_no: data.challanNumber });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: err.message });
    }
});
app.get("/approve-dc/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const dcResult = await pool.query(
      "SELECT * FROM delivery_challan WHERE id = $1",
      [id]
    );

    if (!dcResult.rows.length) {
      return res.status(404).send("DC not found");
    }

    const dc = dcResult.rows[0];
    const requesterEmail = dc.requester; // optional, not used here

    res.send(`
      <h2>Delivery Challan Review</h2>
      <p><strong>Challan No:</strong> ${dc.challan_no}</p>

      <a href="/approve-dc/${id}/view-pdf"
         target="_blank"
         style="padding:10px 20px; background:#0d6efd; color:white; text-decoration:none;">
         👁 VIEW PDF
      </a>

      <br><br>

      <form method="POST" action="/approve-dc/${id}/approve@89">
        <button type="submit"
          style="padding:10px 20px; background:#28a745; color:white;">
          ✅ APPROVE DC
        </button>
      </form>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading DC");
  }
});

app.post("/approve-dc/:id/approve@89", async (req, res) => {
  console.log('approve dc has been done');
      try {
        const { id } = req.params;

        // Update DC status
        await pool.query(
            `UPDATE delivery_challan
             SET
                approval_status='approved',
                approved_at=NOW(),
                approved_by=manager_email
             WHERE id=$1`,
            [id]
        );
        const dcResult = await pool.query(
            "SELECT * FROM delivery_challan WHERE id = $1",
            [id]
        );
        if (dcResult.rows.length === 0) {
            return res.status(404).send("DC not found");
        }
        const dc = dcResult.rows[0];
        const requesterEmail = dc.requester;
         if (!requesterEmail) {
            return res.send(`
                <h1 style="color:green; font-family:sans-serif;">
                    ✔ Delivery Challan Approved Successfully!
                </h1>
                <p>Note: No requester email found to send PDF.</p>
            `);
        }
      const itemsResult = await pool.query(
            "SELECT * FROM delivery_challan_items WHERE challan_id = $1 ORDER BY id",
            [id]
        );
        const items = itemsResult.rows.map((row) => ({
            part_no: row.part_no,
            description: row.description,
            hsn: row.hsn,
            quantity: row.quantity,
            unit: row.unit || "pcs",
            remarks: row.remarks,
        }));

        // Prepare DC data for PDF
        const dcData = {
            challanNo: dc.challan_no,
            challanDate: new Date(dc.challan_date).toLocaleDateString(),
            deliveryDate: dc.delivery_date ? new Date(dc.delivery_date).toLocaleDateString() : "N/A",
            vehicleNo: dc.vehicle_no,
            consignor: {
                name: dc.consignor_name,
                address: dc.consignor_address,
                gst: dc.consignor_gst,
            },
            consignee: {
                name: dc.consignee_name,
                address: dc.consignee_address,
                gst: dc.consignee_gst,
                contact: dc.consignee_contact,
                phone: dc.consignee_phone,
            },
            reason: dc.reason,
            items: items,
            type: dc.dc_type,
            signPath: "public/images/signature.png",
            company: { logo: "public/images/lg.jpg" },
            line: "public/images/line.png",
        };
        const timestamp = Date.now();
        const fileName = `DC_${dc.challan_no}_${timestamp}.pdf`;
        const filePath = path.join(uploadsDir, fileName);

        generateDeliveryChallan(dcData, filePath);

        // Wait for PDF generation
        setTimeout(async () => {
            if (fs.existsSync(filePath)) {
                // Send email with PDF to requester
                const transporter = nodemailer.createTransport({
                    host: "smtp.office365.com",
                    port: 587,
                    secure: false,
                    auth: {
                        user: "No-reply@kietsindia.com",
                        pass: "process.env.NO_PASSWORD",
                    },
                    tls: { rejectUnauthorized: false },
                });

                await transporter.sendMail({
                    from: "No-reply@kietsindia.com",
                    to: requesterEmail,
                    subject: `Delivery Challan Approved - ${dc.challan_no}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px;">
                            <h2 style="color: #28a745;">Delivery Challan Approved</h2>
                            <p>Dear User,</p>
                            <p>Your Delivery Challan <strong>${dc.challan_no}</strong> has been approved.</p>
                            <p>Please find the PDF attached.</p>
                            <br>
                            <p>Best regards,<br>KIET Technologies Team</p>
                        </div>
                    `,
                    attachments: [
                        {
                            filename: fileName,
                            path: filePath,
                            contentType: 'application/pdf'
                        }
                    ]
                });

                // Clean up file after sending
                fs.unlinkSync(filePath);

                res.send(`
                    <h1 style="color:green; font-family:sans-serif;">
                        ✔ Delivery Challan Approved Successfully!
                    </h1>
                    <p>PDF has been sent to the requester.</p>
                `);
            } else {
                res.send(`
                    <h1 style="color:green; font-family:sans-serif;">
                        ✔ Delivery Challan Approved Successfully!
                    </h1>
                    <p>Note: PDF generation failed, but approval was successful.</p>
                `);
            }
        }, 2000); // Wait 2 seconds for PDF generation

    } catch (err) {
        console.error(err);
        res.status(500).send("Error approving DC");
    }

});



app.get("/approve-dc/:id/view-pdf", async (req, res) => {
  try {
    const { id } = req.params;

    const dcRes = await pool.query(
      "SELECT * FROM delivery_challan WHERE id=$1",
      [id]
    );

    const itemsRes = await pool.query(
      "SELECT * FROM delivery_challan_items WHERE challan_id=$1",
      [id]
    );

    if (dcRes.rowCount === 0) {
      return res.send("<h2>❌ Delivery Challan not found</h2>");
    }

    const dc = dcRes.rows[0];
    const items = itemsRes.rows;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Delivery Challan</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f4f6f8;
          padding: 20px;
        }
        .container {
          max-width: 900px;
          margin: auto;
          background: #fff;
          padding: 25px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        h1 {
          text-align: center;
          color: #1e3a8a;
          margin-bottom: 10px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .header div {
          font-size: 14px;
        }
        .section {
          margin-bottom: 20px;
        }
        .section h3 {
          background: #1e40af;
          color: white;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 15px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        table th, table td {
          border: 1px solid #cbd5e1;
          padding: 8px;
          font-size: 14px;
        }
        table th {
          background: #e0e7ff;
          text-align: left;
        }
        .footer {
          margin-top: 30px;
          display: flex;
          justify-content: space-between;
        }
        .signature {
          margin-top: 50px;
          text-align: center;
          font-size: 14px;
        }
        .print-btn {
          text-align: right;
          margin-bottom: 15px;
        }
        .print-btn button {
          padding: 8px 16px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        @media print {
          .print-btn { display: none; }
          body { background: white; }
        }
      </style>
    </head>
    <body>

      <div class="container">

        <div class="print-btn">
          <button onclick="window.print()">🖨 Print / Save PDF</button>
        </div>

        <h1>Delivery Challan</h1>

        <div class="header">
          <div>
            <strong>Challan No:</strong> ${dc.challan_no}<br>
            <strong>Challan Date:</strong> ${dc.challan_date.toLocaleDateString()}<br>
            <strong>Delivery Date:</strong> ${dc.delivery_date.toLocaleDateString()}
          </div>
          <div>
            <strong>Vehicle No:</strong> ${dc.vehicle_no}<br>
            <strong>Project:</strong> ${dc.project_name || "-"}
          </div>
        </div>

        <div class="section">
          <h3>Consignor Details</h3>
          <p>
            <strong>Name:</strong> ${dc.consignor_name}<br>
            <strong>GST:</strong> ${dc.consignor_gst}<br>
            <strong>Address:</strong> ${dc.consignor_address}
          </p>
        </div>

        <div class="section">
          <h3>Consignee Details</h3>
          <p>
            <strong>Name:</strong> ${dc.consignee_name}<br>
            <strong>GST:</strong> ${dc.consignee_gst}<br>
            <strong>Address:</strong> ${dc.consignee_address}
          </p>
        </div>

        <div class="section">
          <h3>Item Details</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${item.description}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unit || "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        

      </div>

    </body>
    </html>
    `;

    res.send(html);

  } catch (err) {
    console.error(err);
    res.status(500).send("<h2>❌ Server Error</h2>");
  }
});


app.post("/approve-dc/:id/approve", async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Fetch DC
    const dcRes = await pool.query(
      "SELECT * FROM delivery_challan WHERE id=$1",
      [id]
    );

    if (dcRes.rowCount === 0) {
      return res.status(404).send("Delivery Challan not found");
    }

    const dc = dcRes.rows[0];

    if (dc.approval_status !== "pending") {
      return res.send("Delivery Challan already processed");
    }

    const requesterEmail = dc.created_by; // adjust column name if different

    // 2️⃣ Approve DC
    await pool.query(
      `UPDATE delivery_challan
       SET approval_status='approved',
           approved_at=NOW(),
           approved_by=manager_email
       WHERE id=$1`,
      [id]
    );

    // 3️⃣ Fetch items
    const itemsResult = await pool.query(
      "SELECT * FROM delivery_challan_items WHERE challan_id=$1 ORDER BY id",
      [id]
    );

    const items = itemsResult.rows.map(row => ({
      part_no: row.part_no,
      description: row.description,
      hsn: row.hsn,
      quantity: row.quantity,
      unit: row.unit || "pcs",
      remarks: row.remarks,
    }));

    // 4️⃣ Prepare PDF data
    const dcData = {
      challanNo: dc.challan_no,
      challanDate: new Date(dc.challan_date).toLocaleDateString(),
      deliveryDate: dc.delivery_date
        ? new Date(dc.delivery_date).toLocaleDateString()
        : "N/A",
      vehicleNo: dc.vehicle_no,
      consignor: {
        name: dc.consignor_name,
        address: dc.consignor_address,
        gst: dc.consignor_gst,
      },
      consignee: {
        name: dc.consignee_name,
        address: dc.consignee_address,
        gst: dc.consignee_gst,
        contact: dc.consignee_contact,
        phone: dc.consignee_phone,
      },
      reason: dc.reason,
      items,
      type: dc.dc_type,
      signPath: "public/images/signature.png",
      company: { logo: "public/images/lg.jpg" },
      line: "public/images/line.png",
    };

    // 5️⃣ Generate PDF
    const fileName = `DC_${dc.challan_no}_${Date.now()}.pdf`;
    const filePath = path.join(uploadsDir, fileName);

    await generateDeliveryChallan(dcData, filePath);

    // 6️⃣ Send Email
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: 'No-reply@kietsindia.com',
        pass: "process.env.NO_PASSWORD",
      },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: requesterEmail,
      subject: `Delivery Challan Approved - ${dc.challan_no}`,
      html: `
        <h2 style="color:#28a745">Delivery Challan Approved</h2>
        <p>Your Delivery Challan <b>${dc.challan_no}</b> has been approved.</p>
        <p>Please find the attached PDF.</p>
        <br>
        <p>Regards,<br>KIET Technologies Team</p>
      `,
      attachments: [{ filename: fileName, path: filePath }],
    });

    // 7️⃣ Delete PDF
    fs.unlinkSync(filePath);

    // 8️⃣ Send response ONCE
    res.send(`
      <h1 style="color:green">✔ Delivery Challan Approved</h1>
      <p>PDF sent to requester</p>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});


app.post("/submit-inventory_local", upload.single("invoice_local"), async (req, res) => {
  try {
    const {
      management_type,
      order_id,
      grn,
      shopName,
      totalCost,
      addditionInfo,
      purchasedBy
    } = req.body;
    console.log('req.body',req.body);

    // Check if invoice file is uploaded
    const invoiceFile = req.file ? req.file.filename : null;

    // Insert local purchase entry into local_inventory_entries table
    const insertQuery = `
            INSERT INTO local_inventory_entries
            (purchase_order_id, grn_number, invoice_file, shop_name, total_cost,additional_info, purchaser)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

    const values = [
      order_id
      , grn
      , invoiceFile
      , shopName
      , totalCost
      , addditionInfo
      , purchasedBy
    ];

    const { rows } = await pool.query(insertQuery, values);

    res.json({
      success: true,
      message: "Local purchase entry submitted successfully",
      entry: rows[0],
    });
  } catch (error) {
    console.error("Error submitting local purchase entry:", error);
    res.status(500).json({ success: false, error: "Failed to submit local purchase entry" });
  }
});



function isAuthenticated(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

// GET project details
app.get('/api/project-details_info', isAuthenticated, async (req, res) => {
  try {
    // Example DB query (replace with your DB logic)
    const result = await pool.query(`
      SELECT
        id,
        description,
        project_code,
        quantity,
        customer,
        user_name,
        po_no,
        po_date,
        value_per_unit,
        total_po_value_pending,
        delivery_status,
        delivery_date,
        inv_type,
        invoice_no,
        invoice_date,
        base_value,
        total_value,
        currency,
        assigned_to,
        assigned_on,
        budget,
        target_date,
        project_status
        
      FROM project_info
      ORDER BY po_date DESC
    `);

    if (result.rows.length === 0) {
      return res.json({ message: 'No projects found' });
    }

    res.json(result.rows);

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//post work log

app.post("/api/work-log", async (req, res) => {
  try {
    const { email, task_description, module } = req.body;

    if (!email || !task_description) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await pool.query(
      `
      INSERT INTO daily_tasks
      (email, task_description, task_date, task_time, module)
      VALUES ($1, $2, (timezone('Asia/Kolkata', now()))::date,
        (timezone('Asia/Kolkata', now()))::time, $3)
      `,
      [email, task_description, module]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/daily-tasks", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, task_description, module, 
              task_date::text, task_time::text
       FROM daily_tasks
       ORDER BY task_date DESC, task_time DESC`
    );

    res.json(result.rows); // returns array of tasks
  } catch (err) {
    console.error("Error fetching daily tasks:", err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});



app.put("/api/assign_to", async (req, res) => {
  try {
    const selectedValue=req.body.selectedValue;
    console.log("req body values",req.body)
    const id=req.body.current_id;
    const budget=parseFloat(req.body.budgetValue);
    const target=req.body.target;
    const updateQuery = `
      UPDATE project_info SET
        assigned_to = $1,
        assigned_on = CURRENT_TIMESTAMP,
        budget= $2,
        target_date=$3
      WHERE id = $4
      RETURNING *
    `;  
    const values = [
      selectedValue,
      budget  ,
      target,
      id

    ];
    const result = await pool.query(updateQuery, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json({
      success: true,
      message: "Project assigned successfully",
      project: result.rows[0]
    });
  }

  catch (error) {
    console.error("Error in /api/assign_to:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



app.get("/api/know_budget/:project_code", async (req, res) => {
  try {
    const project_code = req.params.project_code;
    console.log("Project code received:", project_code);
    const result = await pool.query(
      `SELECT budget FROM project_info WHERE project_code = $1 ORDER BY id DESC LIMIT 1`,
      [project_code]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    const budget = result.rows[0].budget;
    res.json({ budget });
  } catch (error) {
    console.error("Error fetching budget:", error);
    res.status(500).json({ error: "Failed to fetch budget" });
  }
});
app.put('/api/update-order', async (req, res) => {
  try {
    let { id, invoice_no, invoice_date, delivery_status } = req.body;

    if (!id) {
      return res.status(400).json({ message: 'Order ID required' });
    }

    // ✅ FIX: Convert empty string to NULL
    invoice_no = invoice_no?.trim() || null;
    invoice_date = invoice_date ? invoice_date : null;
    delivery_status = delivery_status || null;

    const sql = `
      UPDATE project_info
      SET
        invoice_no = $1,
        invoice_date = $2,
        delivery_status = $3
      WHERE id = $4
      RETURNING *;
    `;

    const values = [
      invoice_no,
      invoice_date,      // ← NULL or 'YYYY-MM-DD'
      delivery_status,
      id
    ];

    const result = await pool.query(sql, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({
      message: 'Invoice updated successfully',
      order: result.rows[0]
    });

  } catch (err) {
    console.error('SQL Error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});




app.get('/api/project-po/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT po_file FROM project_info WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0 || !result.rows[0].po_file) {
      return res.status(404).json({
        success: false,
        message: 'PO file not found'
      });
    }

    res.json({
      success: true,
      po_file: result.rows[0].po_file
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Error fetching PO file'
    });
  }
});


app.post(
  "/api/project-details_",
  upload.single('po_upload'),
  async (req, res) => {
    console.log('RAW BODY:', req.body);
console.log('RAW ITEMS FIELD:', req.body.items);
console.log('TYPE OF ITEMS:', typeof req.body.items);

const poFilePath = req.file
  ? `uploads/${req.file.filename}`
  : null;



    const client = await pool.connect();


    try {
      await client.query('BEGIN');

      const {
        customer,
        userName,
        projectCode,
        description,
        quantity,
        valuePerUnit,
        deliveryStatus,
        poNo,
        poDate,
        currency,
        items,
        baseValue,
        totalValue,
        totalPoValuePending,
        invoiceNo,
        invoiceDate
      } = req.body;

      // 1️⃣ Insert project
      const projectResult = await client.query(
        `INSERT INTO project_info
         (customer, user_name, project_code, description, quantity,
          value_per_unit, delivery_status, po_no, po_date, currency,inv_type,po_file,base_value,total_value,total_po_value_pending, invoice_no, invoice_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [
          customer,
          userName,
          projectCode,
          description,
          quantity,
          valuePerUnit,
          deliveryStatus,
          poNo,
          poDate,
          currency,
          req.body.inv_type,
          poFilePath,
          baseValue,
          totalValue,
          totalPoValuePending,
          invoiceNo ,
          invoiceDate
        ]
      );

      const projectId = projectResult.rows[0].id;

      // 2️⃣ Insert items (OPTIONAL)
      const parsedItems = items ? JSON.parse(items) : [];
      console.log('Parsed items:', parsedItems);

      for (const item of parsedItems) {
        await client.query(
          `INSERT INTO project_items
           (project_id, item_name, quantity, unit_price, total)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            projectId,
            item.item_name,
            item.quantity,
            item.unit_price,
            item.total
          ]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        projectId,
        itemsInserted: parsedItems.length
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(error);
      res.status(500).json({
        success: false,
        message: error.message
      });

    } finally {
      client.release();
    }
  }
);

app.get('/api/project-items/:projectId', async (req, res) => {
  const { projectId } = req.params;

  // safety check
  if (!projectId || isNaN(projectId)) {
    return res.status(400).json({ message: 'Invalid project ID' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         id,
         item_name,
         quantity,
         unit_price,
         total
       FROM project_items
       WHERE project_id = $1
       ORDER BY id ASC`,
      [projectId]
    );

    // Always return array (frontend expects array)
    res.json(rows);

  } catch (err) {
    console.error('Error fetching project items:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get("/assigned-projects/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT id,
        description,
        project_code,
        budget,
        assigned_to,
        assigned_on,
        delivery_status,
        delivery_date,
        target_date,
        po_no,
        project_status,
        remaining_budget


       FROM project_info
       WHERE assigned_to = $1
       ORDER BY po_date DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});


app.get("/attendance", (req, res) => {
  res.render("attendence", {
    user: req.session.user
  });
});

app.put("/api/mark_project_completed", async (req, res) => {
  const { project_id } = req.body;
  console.log("backednd retrived",req.body);
  try {
    await pool.query(
      "UPDATE project_info SET project_status = 'Completed',delivery_status = 'Completed'  WHERE project_code = $1",
      [project_id]
    );
    res.status(200).json({ message: "Project marked completed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update project" });
  }
});

app.post("/api/register-face", async (req, res) => {
  try {
    const { empId, name, image } = req.body;
    console.log("Received:", empId, name, image?.substring(0,50));

    const desc = await getDescriptor(image);
    if (!desc) return res.json({ success: false, message: "No face detected" });

    await pool.query(
      `INSERT INTO employees (emp_id, name)
       VALUES ($1,$2)
       ON CONFLICT (emp_id) DO NOTHING`,
      [empId, name]
    );

    await pool.query(
      `INSERT INTO face_data (emp_id, face_descriptor)
       VALUES ($1,$2)
       ON CONFLICT (emp_id) DO UPDATE SET face_descriptor = EXCLUDED.face_descriptor`,
      [empId, JSON.stringify(desc)]
    );

    res.json({ success: true, message: "Face registered successfully ✅" });
  } catch (err) {
    console.error("Register face error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* SCAN ATTENDANCE */
app.post("/api/scan", async (req, res) => {
  const scanDesc = await getDescriptor(req.body.image);
  const location=req.body.location;
  
  if (!scanDesc) return res.json({ success: false });

  const faces = await pool.query("SELECT emp_id, face_descriptor FROM face_data");

  let matched = null;
  let min = 0.6;

  for (const f of faces.rows) {
    const d = distance(scanDesc, f.face_descriptor);
    if (d < min) {
      min = d;
      matched = f.emp_id;
    }
  }

  if (!matched) return res.json({ success: false });

  const now = new Date();
  const status = now.getHours() > 9 ? "Late" : "Present";

  await pool.query(
    `INSERT INTO attendance (emp_id, date, time_in, status,lat, lng)
     VALUES ($1,CURRENT_DATE,CURRENT_TIME,$2,$3,$4)
     ON CONFLICT (emp_id,date) DO NOTHING`,
    [matched, status,location.lat,location.lng]
  );

  res.json({ success: true, empId: matched, status });
});

/* HISTORY */
async function getLocationName(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "FaceAttendanceApp/1.0" } // required by Nominatim
    });
    const data = await res.json();
    return data.display_name;
  } catch (err) {
    console.error("Reverse geocoding error:", err);
    return null;
  }
}

app.get("/api/history", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT emp_id, date, time_in, status, lat, lng
       FROM attendance ORDER BY date DESC`
    );

    // Map lat/lng to human-readable locations
    const rows = await Promise.all(result.rows.map(async r => {
      const location = await getLocationName(r.lat, r.lng);
      return { ...r, location };
    }));

    res.json(rows);

  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).json({ error: "Failed to fetch attendance history" });
  }
});


app.get("/api/projects", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        customer,
        
        project_code,
        description,
        budget,
        assigned_to,
        total_value,
        user_name,

        
        delivery_status,
        assigned_on AS assigned_on
      FROM project_info
      WHERE assigned_on is NOT NULL
      ORDER BY id DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});


app.put('/update/dc/close',async(req,res)=>{
  const id_close=req.body.order_id;
  try {
    await pool.query(
      "UPDATE delivery_challan SET approval_status = 'Returned' WHERE id = $1",
      [id_close
      ]
    );
    res.status(200).json({ message: "Project marked completed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update project" });
  }
});

app.post("/process/store", async (req, res) => {
  const { process, who,prj_code} = req.body;
  console.log("received data to backend",req.body);

  if (!process || !who) {
    return res.status(400).json({ message: "All fields required" });
  }

  await pool.query(
    "INSERT INTO process_log (process, who,project_code) VALUES ($1, $2,$3)",
    [process, who,prj_code]
  );

  res.json({ message: "Stored successfully" });
});

app.get('/process/view/json', async (req, res) => {
  const result = await pool.query(
    'SELECT process, who, created_at,project_code FROM process_log ORDER BY created_at DESC'
  );
  res.json(result.rows);
});




app.get('/getreq/:project_code', async (req, res) => {
  try {
    const { project_code } = req.params;

    const result = await pool.query(
      `SELECT assigned_to FROM project_info WHERE project_code = $1`,
      [project_code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project code not found" });
    }

    const assignedToEmail = result.rows[0].assigned_to;

    // Mail transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: "No-reply@kietsindia.com",
        pass: "process.env.NO_PASSWORD",
      },
      tls: { rejectUnauthorized: false },
    });
    console.log("assigned_to ",assignedToEmail);

    const approvalLink = `https://kietprocure.com/approve-project/${project_code}`;
    const viewLink = `https://kietprocure.com/view-project/${project_code}`;

    await transporter.sendMail({
      from: "No-reply@kietsindia.com",
      to:assignedToEmail,
      subject: `Approval Required — ${project_code}`,
      html: `
        <p><b>Dear Approver,</b></p>
        <p>A new Purchase Order has been raised.</p>

        <table border="1" cellpadding="6" style="border-collapse:collapse;">
          <tr><td><b>Project Code</b></td><td>${project_code}</td></tr>
          <tr><td><b>Date</b></td><td>${new Date().toLocaleDateString()}</td></tr>
        </table>

        <div style="margin-top:20px;">
        <a href="${viewLink}"
           style="background:#007bff;color:white;
           padding:12px 20px;margin-right:10px;
           text-decoration:none;border-radius:5px;">
           👁 VIEW ORDER
        </a>
          <a href="${approvalLink}"
             style="background:#28a745;color:white;padding:12px 20px;
             text-decoration:none;border-radius:5px;">
             ✅ APPROVE
          </a>
        </div>

        <p style="font-size:12px;color:#777;margin-top:30px;">
          © 2025 KIET TECHNOLOGIES PVT LTD
        </p>
      `,
    });

    res.json({
      success: true,
      message: "Approval mail sent successfully",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.get('/view-project/:project_code', async (req, res) => {
  try {
    const { project_code } = req.params;

    // 1️⃣ Get PO Header
    const result = await pool.query(
      `SELECT * FROM purchase_orders WHERE project_code_number = $1`,
      [project_code]
    );

    if (!result.rows.length) {
      return res.send("<h3>Project not found</h3>");
    }

    const p = result.rows[0];

    // 2️⃣ Get PO Items
    const itemsResult = await pool.query(
      `SELECT * FROM purchase_order_items WHERE purchase_order_id = $1`,
      [p.id]
    );

    // 3️⃣ Calculations
    let subTotal = 0;
    let gstTotal = 0;

    const itemRows = itemsResult.rows.map((i, index) => {
      const qty = Number(i.quantity);
      const price = Number(i.unit_price);
      const discount = Number(i.discount || 0);
      const gstRate = Number(i.gst || 0);

      const base = (qty * price) - discount;
      const gstAmt = (base * gstRate) / 100;
      const total = base + gstAmt;

      subTotal += base;
      gstTotal += gstAmt;

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${i.part_no}</td>
          <td>${i.description}</td>
          <td>${i.hsn_code || "-"}</td>
          <td>${qty}</td>
          <td>${i.unit || "-"}</td>
          <td>₹${price.toFixed(2)}</td>
          <td>${gstRate}%</td>
          <td>₹${gstAmt.toFixed(2)}</td>
          <td>₹${total.toFixed(2)}</td>
        </tr>
      `;
    }).join("");

    const grandTotal = subTotal + gstTotal;

    // 4️⃣ Send HTML
    res.send(`
      <h2>📄 Purchase Order Details</h2>

      <table border="1" cellpadding="8" style="border-collapse:collapse;margin-bottom:20px;">
        <tr><td><b>Project Code</b></td><td>${p.project_code_number}</td></tr>
        <tr><td><b>Project Name</b></td><td>${p.project_name}</td></tr>
        
        <tr><td><b>Status</b></td><td>${p.assign_status}</td></tr>
        <tr><td><b>Date</b></td><td>${new Date().toLocaleDateString()}</td></tr>
      </table>

      <h3>🧾 Items</h3>

      <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%;">
        <tr style="background:#f2f2f2;">
          <th>#</th>
          <th>Part No</th>
          <th>Description</th>
          <th>HSN</th>
          <th>Qty</th>
          <th>Unit</th>
          <th>Unit Price</th>
          <th>GST %</th>
          <th>GST Amt</th>
          <th>Total</th>
        </tr>
        ${itemRows || `<tr><td colspan="10" align="center">No items found</td></tr>`}
      </table>

      <div style="margin-top:20px;width:320px;">
        <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%;">
          <tr><td><b>Sub Total</b></td><td>₹${subTotal.toFixed(2)}</td></tr>
          <tr><td><b>GST Total</b></td><td>₹${gstTotal.toFixed(2)}</td></tr>
          <tr style="background:#e8ffe8;">
            <td><b>Grand Total</b></td>
            <td><b>₹${grandTotal.toFixed(2)}</b></td>
          </tr>
        </table>
      </div>

      <div style="margin-top:25px;">
        <a href="/approve-project/${p.project_code_number}"
           style="background:#28a745;color:white;
           padding:12px 20px;text-decoration:none;border-radius:5px;">
           ✅ APPROVE
        </a>
      </div>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading project");
  }
});


app.get('/approve-project/:project_code', async (req, res) => {
  try {
    const { project_code } = req.params;

    await pool.query(
      `
      UPDATE purchase_orders
      SET assign_status = 'verified'
      WHERE project_code_number = $1
      `,
      [project_code]
    );

    res.send(`
      <h2 style="color:green;">✅ Project Approved Successfully</h2>
      <p>Project Code: <b>${project_code}</b></p>
      <p>You may now close this window.</p>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("Approval failed");
  }
});


app.get('/process-details/:project_code', async (req, res) => {
  try {
    const { project_code } = req.params;

 const result = await pool.query(
      `SELECT process, who, created_at
       FROM process_log
       WHERE project_code = $1
       ORDER BY created_at ASC`,
      [project_code]
    );


    // ✅ Return array even if empty
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});





const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
