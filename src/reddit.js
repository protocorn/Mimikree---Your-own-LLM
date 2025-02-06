// reddit.js
const snoowrap = require('snoowrap');
const express = require('express');
const app = express();
const port = 3000;

// Reddit OAuth2 parameters from .env file
const {
  REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET,
  REDDIT_USER_AGENT,
  REDDIT_REDIRECT_URI
} = require("../config/apiKeys")

// Function to get user posts and comments by username
async function getUserPostsAndComments(username) {
    try {
      const user = await r.getUser(username);
  
      // Get user posts (all types)
      const posts = await user.getSubmitted({ limit: 10 });  // Adjust limit as needed
      const comments = await user.getComments({ limit: 10 });  // Adjust limit as needed
  
      // Map the posts and comments to a desired structure
      const postsData = posts.map(post => ({
        type: 'post',
        title: post.title,
        url: post.url,
        score: post.score,
        subreddit: post.subreddit.display_name,
        created: post.created_utc
      }));
  
      const commentsData = comments.map(comment => ({
        type: 'comment',
        text: comment.body,
        score: comment.score,
        subreddit: comment.subreddit.display_name,
        created: comment.created_utc,
        parentPost: comment.link_title,
        postUrl: comment.permalink
      }));
  
      return { posts: postsData, comments: commentsData };
    } catch (error) {
      console.error('Error fetching user data:', error);
      return { posts: [], comments: [] };
    }
  }
  
  // Export the function for use in server.js or other files
  module.exports = {
    getUserPostsAndComments
  };