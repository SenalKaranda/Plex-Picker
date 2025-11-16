FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json before other files for caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]