FROM node:26.13.1-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5 AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec svelte-kit sync && pnpm exec vite build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:26.13.1-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/build build
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "build"]
