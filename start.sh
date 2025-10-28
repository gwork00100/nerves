#!/bin/sh
# Start Ollama in background
ollama serve &

# Wait until Ollama API is ready
until curl -s http://localhost:11434/api/tags > /dev/null; do
  echo "Waiting for Ollama to start..."
  sleep 1
done

# Pull the models
ollama pull tinyllama
ollama pull phi3:mini

# Start Node server
node app.js
