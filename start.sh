#!/bin/sh

# Start Ollama in the background
echo "Starting Ollama server..."
ollama serve &

# Wait until Ollama API is ready (timeout after 60s)
timeout=60
elapsed=0
while ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; do
  echo "Waiting for Ollama server..."
  sleep 1
  elapsed=$((elapsed + 1))
  if [ "$elapsed" -ge "$timeout" ]; then
    echo "Ollama server failed to start in $timeout seconds"
    exit 1
  fi
done

echo "Ollama server is up! Pulling models..."

# Pull models in parallel
ollama pull tinyllama &
ollama pull phi3:mini &
wait

echo "Models pulled! Starting Node app..."

# Start your Node app
node app.js
