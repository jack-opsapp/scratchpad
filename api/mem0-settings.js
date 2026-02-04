/**
 * mem0 Settings Endpoint
 * Handles user memory management (clear memory)
 */

import { clearUserMemory } from './mem0.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Check if mem0 is configured
    if (!process.env.MEM0_API_KEY) {
      return res.status(200).json({
        success: true,
        message: 'AI memory not configured - nothing to clear'
      });
    }

    const success = await clearUserMemory(userId);

    if (success) {
      return res.status(200).json({
        success: true,
        message: 'AI memory cleared successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to clear AI memory'
      });
    }

  } catch (error) {
    console.error('mem0-settings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Something went wrong',
      details: error.message
    });
  }
}
