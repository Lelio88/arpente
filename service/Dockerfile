# Image du service d'Arpente (assistant IA, passerelle de connexion).
#
# Construite depuis la RACINE du dépôt (contexte « . ») : le service réutilise
# utils/ et types/ de l'app, et compile content/ au build — le contenu servi
# à l'assistant est donc celui de la version publiée au même moment.
#   docker build -f service/Dockerfile -t arpente-service .
#
# Pas d'étape de compilation TypeScript : tsx exécute les sources, comme en
# développement. L'image tourne sous l'utilisateur non root « node ».

FROM node:24-alpine AS dependances
WORKDIR /app/service
COPY service/package.json service/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3012
WORKDIR /app
COPY --from=dependances /app/service/node_modules service/node_modules
COPY service/package.json service/tsconfig.json service/
COPY service/src service/src
COPY service/scripts service/scripts
COPY utils utils
COPY types types
COPY content content
RUN cd service && node --import tsx scripts/compiler-contenu.ts && rm -rf /app/content
USER node
WORKDIR /app/service
EXPOSE 3012
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3012/sante || exit 1
CMD ["node", "--import", "tsx", "src/index.ts"]
