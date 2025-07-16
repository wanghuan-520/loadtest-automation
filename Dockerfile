FROM grafana/k6:latest

# Set working directory
WORKDIR /tests

# Copy test files
COPY . .

# Set environment variables
ENV NODE_PATH=/usr/lib/node_modules
ENV PATH="/usr/local/bin:${PATH}"

# Default command (can be overridden)
ENTRYPOINT ["k6"]
CMD ["run", "scripts/performance-test.js"] 