require("dotenv").config();
const express = require("express");
const router = express.Router();

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const TWITTER_LOGIN_URL = "https://twitter.com/login";
TWITTER_USERNAME = "Sahil365132"
TWITTER_PASSWORD = "Saahil@2412"

const scrapeTwitterProfile = async (username) => {
    const browser = await puppeteer.launch({ headless: true }); // Set to true for production
    const page = await browser.newPage();

    try {
        console.log("Logging into Twitter...");

        // Visit the login page
        await page.goto(TWITTER_LOGIN_URL, { waitUntil: "networkidle2" });

        // Log the environment variables for debugging
        console.log("Username:", TWITTER_USERNAME);
        console.log("Password:", TWITTER_PASSWORD);

        // Wait for the username input field
        await page.waitForSelector('input[name="text"]', { visible: true });
        const usernameField = await page.$('input[name="text"]');
        if (usernameField) {
            console.log("Entering username...");
            await usernameField.type(TWITTER_USERNAME, { delay: 200 });
            await page.keyboard.press("Enter");
        } else {
            console.log("Username field not found.");
            return;
        }

        // Wait for the password field to appear and enter password
        await page.waitForSelector('input[name="password"]', { visible: true });
        const passwordField = await page.$('input[name="password"]');
        if (passwordField) {
            console.log("Entering password...");
            await passwordField.type(TWITTER_PASSWORD, { delay: 200 });
            await page.keyboard.press("Enter");
        } else {
            console.log("Password field not found.");
            return;
        }

        // Wait for navigation to complete
        await page.waitForNavigation({ waitUntil: "networkidle2" });

        console.log("Login successful!");

        // Go to user profile
        await page.goto(`https://twitter.com/${username}`, { waitUntil: "networkidle2" });

        // Scroll until the end of the page or tweet count reaches 50
        let previousHeight = 0;
        let tweetCount = 0;
        const maxTweets = 50;
        const tweets = [];

        while (tweetCount < maxTweets) {
            console.log(`Scrolling... Current tweet count: ${tweetCount}`);
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Get the new height of the page and check if we've reached the end
            let newHeight = await page.evaluate(() => document.body.scrollHeight);
            if (newHeight === previousHeight) {
                console.log("Reached the end of the page.");
                break; // Stop if the page stops loading new tweets
            }
            previousHeight = newHeight;

            // Extract tweets in the current view
            const newTweets = await page.evaluate(() => {
                return [...document.querySelectorAll("div[data-testid='tweetText']")].map(tweet => tweet.innerText);
            });

            // Add new tweets to the list if they're not already included
            newTweets.forEach(tweet => {
                if (!tweets.includes(tweet)) {
                    tweets.push(tweet);
                }
            });

            tweetCount = tweets.length;

            // Stop if we have 50 tweets
            if (tweetCount >= maxTweets) {
                console.log("Collected 50 tweets. Stopping scroll.");
                break;
            }
        }

        // Limit tweets to 50 if necessary
        const limitedTweets = tweets.slice(0, 50);

        // Extract profile data
        const profile = await page.evaluate(() => {
            const name = document.querySelector("div[data-testid='UserName']")?.innerText || "N/A";
            const bio = document.querySelector("div[data-testid='UserDescription']")?.innerText || "N/A";
            const followers = document.querySelector("a[href$='/followers'] span")?.innerText || "N/A";
            return { name, bio, followers };
        });

        console.log(`Scraped ${limitedTweets.length} tweets!`);

        await browser.close();
        return { profile, tweets: limitedTweets };
    } catch (error) {
        console.error("Error scraping Twitter:", error);
        await browser.close();
        return { error: "Failed to scrape Twitter" };
    }
};

router.get("/", (req, res) => {
    res.json({ message: "Twitter API working!" });
});

// API endpoint to get the data
router.post('/scrape', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: "Username is required" });
    }

    const data = await scrapeTwitterProfile(username);
    if (data.error) {
        return res.status(500).json({ error: data.error });
    }

    return res.json(data);
});

module.exports = {router};
