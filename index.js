// server.js
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

// =============================
// CONFIG
// =============================
const PASSWORD = 'aost ujvo vfws ofqf'; // Gmail app password
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "kiet",
    password: "Shashi@1504",
    port: 5432
});

const app = express();

// =============================
// MIDDLEWARE
// =============================
app.use(session({
    secret: 'super-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
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
// ROUTES
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

        if (!result.rows.length) return res.render("index.ejs", { message: "Invalid email or password" });

        const user = result.rows[0];
        if (user.password !== password) return res.render("index.ejs", { message: "Invalid email or password" });
        if (user.role !== role) return res.render("index.ejs", { message: "Unauthorized: Incorrect role" });

        req.session.user = { id: user.id, email: user.email, role: user.role };
        res.render('procurement.ejs', { user, out_fl: email, message: "Login Successful ✅" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error processing request");
    }
});

// Order Raise
app.post("/order_raise", upload.single("quotation"), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: "Not authenticated" });

    const { projectName, projectCodeNumber, supplierName, supplierGst, supplierAddress, urgency, dateRequired, notes } = req.body;
    const products = JSON.parse(req.body.products || "[]");
    const orderedBy = req.session.user.email;
    const quotationFile = req.file ? req.file.filename : null;

    try {
        await pool.query("BEGIN");
        const purchaseOrderNumber = await generatePurchaseOrderNumber();

        const orderResult = await pool.query(
            `INSERT INTO purchase_orders 
            (project_name, project_code_number, purchase_order_number, supplier_name, supplier_gst, supplier_address, urgency, date_required, notes, ordered_by, quotation_file)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [projectName, projectCodeNumber, purchaseOrderNumber, supplierName, supplierGst, supplierAddress, urgency, dateRequired, notes, orderedBy, quotationFile]
        );

        const orderId = orderResult.rows[0].id;

        for (let p of products) {
            await pool.query(
                `INSERT INTO purchase_order_items
                (purchase_order_id, part_no, description, hsn, quantity, unit_price, gst,project_name)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [orderId, p.partNo, p.description, p.hsn, parseInt(p.quantity), parseFloat(p.unitPrice), parseFloat(p.gst),projectName]
            );
        }

        await pool.query("COMMIT");
        res.json({ success: true, message: "✅ Order inserted successfully", purchaseOrderNumber, orderedBy, file: quotationFile });

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

        await transporter.sendMail({ to: email, from: "acc19105@gmail.com", subject: "Password Reset", html: `<p>Click this <a href="${resetURL}">link</a> to reset your password.</p>` });

        res.sendFile(path.join(__dirname, 'public', 'sucess.html'));
    } catch (err) {
        console.error(err);
        res.status(500).send("Error processing request");
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
              project_code_number AS "projectCode",
              purchase_order_number AS "purchaseOrderNumber",
              supplier_name AS "supplierName",
              supplier_gst AS "supplierGst",
              supplier_address AS "supplierAddress",
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



// =============================
// START SERVER
// =============================
app.listen(3000, () => console.log("🚀 Server running at http://localhost:3000"));
