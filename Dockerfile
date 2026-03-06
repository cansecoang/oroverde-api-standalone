# ==========================================
# Etapa 1: Construcción (Builder)
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Metadata
LABEL maintainer="Oro Verde"
LABEL description="NestJS API - Oroverde Product Report"

# Copiamos archivos de dependencias
COPY package*.json ./

# Instalamos dependencias (incluyendo dev para compilación)
RUN npm ci

# Copiamos código fuente
COPY . .

# Compilamos
RUN npm run build

# Validar que la build fue exitosa
RUN test -d dist || (echo "Build failed: dist/ directory not found" && exit 1)

# ==========================================
# Etapa 2: Producción (Runtime)
# ==========================================
FROM node:20-alpine

WORKDIR /app

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copiamos archivos de dependencias
COPY package*.json ./

# Instalar SOLO dependencias de producción
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copiamos dist compilado desde builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Cambiar propietario de archivos a usuario no-root
RUN chown -R nodejs:nodejs /app

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 3000

# Health check - verificar que la API está funcionando
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Comando para arrancar
CMD ["node", "dist/main"]