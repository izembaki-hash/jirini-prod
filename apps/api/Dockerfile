FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npx tsc -p tsconfig.json

FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
# كامل node_modules من مرحلة البناء (يشمل prisma CLI للترحيل عند الإقلاع + العميل المولّد)
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
EXPOSE 4000
VOLUME ["/app/uploads"]
ENTRYPOINT ["./entrypoint.sh"]
