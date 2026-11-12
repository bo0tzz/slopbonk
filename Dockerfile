FROM node:26.13.1-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec svelte-kit sync && pnpm exec vite build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:26.13.1-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/build build
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "build"]
