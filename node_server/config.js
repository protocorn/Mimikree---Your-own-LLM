// config.js
module.exports = {
    production: {
      nodeServer: "https://mimikree.com",
      llamaServer: "https://llama-server.fly.dev",
    },
    test: {
      nodeServer: "http://localhost:3000", // Example: Local GitHub API
      llamaServer: "http://localhost:8080" // Example: Local LLM server
    }
  };