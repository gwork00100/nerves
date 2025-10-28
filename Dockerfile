FROM docker.io/ollama/ollama:latest

# Expose the default port
EXPOSE 11434

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Run your script at container start
CMD ["/start.sh"]
