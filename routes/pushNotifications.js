import express from 'express';
import webpush from 'web-push';
import vapidKeys from '../config/vapidKeys.js';
import { Pool } from 'pg';

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

webpush.setVapidDetails(
  'mailto:acc19105@gmail.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Register subscription endpoint
router.post('/subscribe', async (req, res) => {
  const { subscription, role } = req.body;
  if (!subscription || !role) {
    return res.status(400).json({ error: 'Subscription and role are required' });
  }

  try {
    // Check if subscription already exists
    const existsResult = await pool.query(
      'SELECT 1 FROM push_subscriptions WHERE endpoint = $1',
      [subscription.endpoint]
    );

    if (existsResult.rowCount === 0) {
      // Insert new subscription
      await pool.query(
        'INSERT INTO push_subscriptions (endpoint, expiration_time, keys, role) VALUES ($1, $2, $3, $4)',
        [subscription.endpoint, subscription.expirationTime || null, subscription.keys, role]
      );
    }

    res.status(201).json({ message: 'Subscription added' });
  } catch (err) {
    console.error('Error saving subscription:', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Function to send notification to all subscribers of a role
export async function sendNotification(role, payload) {
  try {
    const { rows } = await pool.query(
      'SELECT endpoint, keys FROM push_subscriptions WHERE role = $1',
      [role]
    );

    const sendPromises = rows.map(sub => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: sub.keys
      };
      return webpush.sendNotification(subscription, JSON.stringify(payload)).catch(async err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Remove expired subscription from DB
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        } else {
          console.error('Push notification error:', err);
        }
      });
    });

    await Promise.all(sendPromises);
  } catch (err) {
    console.error('Error sending notifications:', err);
  }
}

export default router;
