require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const { JSDOM } = require("jsdom");

const router = express.Router();

async function getMediumArticles(username) {
  try {
    const response = await fetch(`https://medium.com/${username}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const articles = [];

    const articlePreviewElements = document.querySelectorAll("article"); // Correct selector for article previews

    for (const articlePreviewElement of articlePreviewElements) { // Use for...of loop for async/await
      const titleElement = articlePreviewElement.querySelector("h2");
      const title = titleElement ? titleElement.textContent.trim() : "No Title";

      const linkElement = articlePreviewElement.querySelector("div[role='link']");
      const link = linkElement ? linkElement.getAttribute("data-href") : null;

      if (!link) continue; // Skip if no link is found

      try {
        const articleResponse = await fetch(link, { // Fetch the actual article page
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
          },
        });

        if (!articleResponse.ok) {
          console.error(`Error fetching article: ${link}, status: ${articleResponse.status}`);
          articles.push({ title, link, content: "Error fetching article" });
          continue;
        }

        const articleHtml = await articleResponse.text();
        const articleDom = new JSDOM(articleHtml);
        const articleDocument = articleDom.window.document;

        // ***CORRECTED TEXT CONTENT EXTRACTION***
        const articleBodyElement = articleDocument.querySelector("article"); // Correct selector!
        let content = "";

        if (articleBodyElement) {
            const paragraphs = articleBodyElement.querySelectorAll("p, h1, h2, h3, li"); // Select all paragraphs

            paragraphs.forEach(paragraph => {
                content += paragraph.textContent.trim() + '\n'; // Add each paragraph's text to content
            });
        } else {
          content = "Article body not found.";
        }
        articles.push({ title, link, content });


      } catch (articleError) {
        console.error(`Error processing article: ${link}`, articleError);
        articles.push({ title, link, content: "Error processing article" });
      }

       await new Promise(resolve => setTimeout(resolve, 2000)); // Rate Limiting - adjust as needed
    }

    return articles;
  } catch (error) {
    console.error("Error fetching articles:", error);
    return null;
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
      const articles = await getMediumArticles(username);

      // If no articles are found or an empty array is returned
      if (!articles || articles.length === 0) {
          return res.status(404).json({ error: "No articles found for the provided username" });
      }

      // Return articles successfully
      return res.json({ username, articles });

  } catch (error) {
      console.error("Error fetching articles:", error);
      // Return error if fetching articles fails
      return res.status(500).json({ error: "Failed to fetch articles from Medium" });
  }
});

module.exports = { router };