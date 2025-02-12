// reddit.js
/*const snoowrap = require('snoowrap');
const express = require('express');
const app = express();
const port = 3000;

// Reddit OAuth2 parameters from .env file
const {
  REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET,
  REDDIT_USER_AGENT,
  REDDIT_REDIRECT_URI
} = require("../config/apiKeys")*/
const express = require("express");
const router = express.Router();

const snoowrap = require('snoowrap');

const reddit = new snoowrap({
  userAgent: 'LLM/1.0.0',  // Set a user agent
  clientId: 'sDEzkNnfLcmnoaKlxxteHA',
  clientSecret: '7wIB4OIg5VyKd_JRJMGwCJ5qn-KQXQ',
  username: 'Apprehensive-Mix3820',
  password: 'Saahil@2412'
});

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