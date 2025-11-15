// config.js
module.exports = {
    production: {
      nodeServer: "https://www.mimikree.com",
      llamaServer: "https://mimikree-your-own-llm-production.up.railway.app",
    },
    test: {
      nodeServer: "http://localhost:3000", // Example: Local GitHub API
      llamaServer: "http://localhost:8080" // Example: Local LLM server
    }
  };