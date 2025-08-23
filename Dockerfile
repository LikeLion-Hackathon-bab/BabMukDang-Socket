# Use the official Node.js image as the base image
FROM node:22-alpine

ARG NODE_ENV=production
ARG PORT=3000

ENV NODE_ENV=${NODE_ENV}
ENV PORT=${PORT}

WORKDIR /app

COPY package*.json ./

RUN npm ci
RUN npm install -g @nestjs/cli

# Copy the rest of the application files
COPY . .

# Build the NestJS application
RUN npm run build

# Expose the application port
EXPOSE ${PORT}

CMD ["node", "dist/main"]