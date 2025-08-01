// Ensure required imports
import dotenv from 'dotenv';
import express from 'express';
import nodemailer from 'nodemailer';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import reservationRouter from './routes/reservation.js';
import reportRouter from './routes/report.js';
import cors from 'cors';
import bcrypt from 'bcrypt';

// Resolve __dirname in ES Module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load Environment Variables
dotenv.config({ path: path.resolve(__dirname, 'process.env') });

const app = express();
const PORT = process.env.PORT || 3100;

// Debug Environment Variables
console.log("✅ ENV PATH:", path.resolve(__dirname, 'process.env'));
console.log("✅ EMAIL_USER:", process.env.EMAIL_USER);
console.log("✅ DB_PASS:", process.env.DB_PASS ? '(Hidden)' : '(Empty)');

// Ensure required environment variables are present
const requiredEnv = ['EMAIL_USER', 'EMAIL_PASS', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
requiredEnv.forEach((env) => {
    if (!process.env[env]) {
        console.error(`❌ Missing required environment variable: ${env}`);
        process.exit(1);
    }
});

// ✅ Middleware Setup
app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Setup MySQL Database Connection
let db;
(async () => {
    try {
        db = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
        });
        console.log('✅ Connected to MySQL Database');

        // Register Routes
        app.use('/', reservationRouter(db));
        app.use('/report', reportRouter(db)); // ✅ Ensure report router is added
    } catch (err) {
        console.error('❌ Database connection failed:', err);
        process.exit(1);
    }
})();

// ✅ Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// ✅ User Registration Route with Email Notification
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);

        // Send confirmation email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Welcome to Daddy\'s Cook House',
            text: `Hello ${username},\n\nYour registration is successful!\n\nEnjoy our services.\n\nThank you!`,
        });

        console.log('✅ Registration Email Sent to:', email);
        res.json({ success: true, message: 'User registered successfully!' });
    } catch (error) {
        console.error('❌ Registration Error:', error);
        res.status(500).json({ success: false, message: 'User already exists or internal error.' });
    }
});

// ✅ Login Route with Email Notification
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required.' });
    }

    try {
        const [user] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);

        if (user.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        const isValid = await bcrypt.compare(password, user[0].password);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        // Send login alert email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user[0].email,
            subject: 'Login Alert - Daddy\'s Cook House',
            text: `Hello ${username},\n\nYou have successfully logged into Daddy's Cook House.\n\nIf this wasn't you, please contact us immediately.`,
        });

        console.log('✅ Login Email Sent to:', user[0].email);
        res.json({ success: true, message: 'Login successful!' });
    } catch (error) {
        console.error('❌ Login Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ✅ Order Submission Route (with dish)
app.post('/submit-order', async (req, res) => {
    const { name, email, phone, quantity, dish } = req.body;

    if (!name || !email || !phone || !quantity || !dish) {
        return res.status(400).json({ success: false, message: 'Missing order details.' });
    }

    try {
        // Save order in database
        await db.execute(
            'INSERT INTO orders (name, email, phone, quantity, dish) VALUES (?, ?, ?, ?, ?)',
            [name, email, phone, quantity, dish]
        );

        // Send order notification email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: 'bbhisikar4@gmail.com',
            subject: 'New Order - Daddy\'s Cook House',
            text: `New Order Details:\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nDish: ${dish}\nQuantity: ${quantity}`,
        });

        console.log('✅ Order Email Sent');
        res.json({ success: true, message: 'Order placed successfully!' });
    } catch (error) {
        console.error('❌ Order Submission Error:', error);
        res.status(500).json({ success: false, message: 'Error processing order.' });
    }
});

// ✅ Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
