FROM node:24-alpine
RUN apk add --no-cache tzdata
ENV NODE_ENV=production TZ=Asia/Jakarta PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
COPY seed ./seed
COPY alat ./alat
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/public/info >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
