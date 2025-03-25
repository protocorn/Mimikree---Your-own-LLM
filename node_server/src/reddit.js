const express = require("express");
const router = express.Router();
const snoowrap = require('snoowrap');
const dotenv = require("dotenv");

dotenv.config();

// Validate required environment variables
const requiredEnvVars = {
    REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
    REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
    REDDIT_USER_AGENT: process.env.REDDIT_USER_AGENT,
    REDDIT_USERNAME: process.env.REDDIT_USERNAME,
    REDDIT_PASSWORD: process.env.REDDIT_PASSWORD
};

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars.join(', '));
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

let reddit;
try {
    reddit = new snoowrap({
        userAgent: requiredEnvVars.REDDIT_USER_AGENT,
        clientId: requiredEnvVars.REDDIT_CLIENT_ID,
        clientSecret: requiredEnvVars.REDDIT_CLIENT_SECRET,
        username: requiredEnvVars.REDDIT_USERNAME,
        password: requiredEnvVars.REDDIT_PASSWORD
    });
    console.log('Reddit client initialized successfully');
} catch (error) {
    console.error('Error initializing Reddit client:', error);
    throw error;
}

async function getRedditUserData(username) {
  try {
    const user = await reddit.getUser(username);

    // Get Recent Posts
    const posts = await user.getSubmissions({ limit: 10 });
    const userPosts = posts.map(post => ({
      title: post.title,
      subreddit: post.subreddit_name_prefixed,
      upvotes: post.ups,
      url: post.url,
      created_utc: post.created_utc,
      content: post.selftext || 'No text content',
    }));

    console.log('Recent Posts:', userPosts);

    return userPosts ;
  } catch (error) {
    console.error('Error fetching Reddit data:', error);
  }
}

// API Home Route
router.get("/", (req, res) => {
  res.json({ message: "Medium API working!" });
});


router.post('/profile', async (req, res) => {
  const { username } = req.body;

  // Ensure username is provided
  if (!username) {
      return res.status(400).json({ error: "Username is required" });
  }

  try {
      // Fetch articles from Medium
      const posts = await getRedditUserData(username);

      return res.json({posts: posts});

  } catch (error) {
      console.error("Error fetching articles:", error);
      // Return error if fetching articles fails
      return res.status(500).json({ error: "Failed to fetch articles from Medium" });
  }
});

module.exports = { router };
// Run the function with a sample username
  // Change to target username