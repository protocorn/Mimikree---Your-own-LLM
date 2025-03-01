// config.js
module.exports = {
    production: {
      nodeServer: "https://mimikree-your-own-llm.vercel.app",
      llamaServer: "https://llama-server.fly.dev",
    },
    test: {
      nodeServer: "http://localhost:3001", // Example: Local GitHub API
      llamaServer: "http://localhost:3002" // Example: Local LLM server
    }
  };