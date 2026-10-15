FROM node:26.12.0-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4 AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec svelte-kit sync && pnpm exec vite build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:26.12.0-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/build build
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "build"]
