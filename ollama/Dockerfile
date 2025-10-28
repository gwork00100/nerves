FROM ollama/ollama:latest

# Pull both models
RUN ollama pull tinyllama && ollama pull phi3:mini

EXPOSE 11434

CMD ["ollama", "serve"]
