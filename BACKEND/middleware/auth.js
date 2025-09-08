const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_PUBLIC_URL, process.env.SUPABASE_PUBLISHABLE_KEY);

// Authentication middleware using Supabase getClaims
const authenticateToken = async (req, res, next) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        message: 'Please provide a valid authentication token'
      });
    }
    const startTime = Date.now();
    // Use Supabase getClaims to verify the token
    const { data, error } = await supabase.auth.getClaims(token);
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`Token verification took ${duration}ms`);

    if (error || !data || !data.claims) {
      console.error('Token verification error:', error);
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Your authentication token is invalid or expired. Please sign in again.'
      });
    }

    // Extract user info from claims
    const claims = data.claims;
    req.user = {
      id: claims.sub,
      email: claims.email,
      role: claims.role,
      aud: claims.aud,
      // Optionally include more fields if needed
      app_metadata: claims.app_metadata,
      user_metadata: claims.user_metadata,
      session_id: claims.session_id,
      is_anonymous: claims.is_anonymous
    };

    console.log(`Authenticated user: ${req.user.id} (${req.user.email})`);
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ 
      error: 'Internal authentication error',
      message: 'An error occurred while processing your authentication.'
    });
  }
};

module.exports = {
  authenticateToken
};
