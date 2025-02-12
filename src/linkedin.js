const { Scrapfly } = require("scrapfly");
const cheerio = require("cheerio");

// Initialize Scrapfly with your API Key
const scrapfly = new Scrapfly({ key: "YOUR_SCRAPFLY_API_KEY" });

// Replace with the target LinkedIn profile URL
const linkedinUrl = "https://www.linkedin.com/in/target-profile/";

// LinkedIn session cookie (required for authenticated scraping)
const cookies = "li_at=YOUR_LINKEDIN_SESSION_COOKIE";

// Scraping function
async function scrapeLinkedInProfile() {
    try {
        const response = await scrapfly.scrape({
            url: linkedinUrl,
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Cookie": cookies
            },
            render: true, // Enables JavaScript rendering
            proxy_pool: "public_residential", // Avoid bot detection
        });

        const html = response.content;
        const $ = cheerio.load(html);

        // Extract user details
        const name = $(".text-heading-xlarge").text().trim();
        const tagline = $(".text-body-medium.break-words").text().trim();
        const summary = $(".pv-about-section").text().trim();

        console.log(`Name: ${name}`);
        console.log(`Tagline: ${tagline}`);
        console.log(`Summary: ${summary}`);

    } catch (error) {
        console.error("Error scraping LinkedIn:", error);
    }
}

scrapeLinkedInProfile();
