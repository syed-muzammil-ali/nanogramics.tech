FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY api ./api
COPY db ./db
COPY dist ./dist
COPY scripts ./scripts
COPY server.mjs ./server.mjs

USER node
EXPOSE 8080
ENV PORT=8080 HOST=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1

CMD ["node", "server.mjs"]
