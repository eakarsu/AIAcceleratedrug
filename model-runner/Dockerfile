FROM node:22-alpine
WORKDIR /runner
COPY server.mjs ./server.mjs
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
