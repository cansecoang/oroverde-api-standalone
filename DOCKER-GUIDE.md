# 🐳 Guía Completa de Dockerización - Oroverde API

## 📊 Tabla de Contenidos
1. [Estructura de Docker](#estructura-de-docker)
2. [Desarrollo Local](#desarrollo-local)
3. [Build para Producción](#build-para-producción)
4. [Deployment en Azure](#deployment-en-azure)
5. [Seguridad](#seguridad)
6. [Troubleshooting](#troubleshooting)

---

## 🏗️ Estructura de Docker

### Archivos Principales

```
oroverde-api-standalone/
├── Dockerfile              # Multi-stage para desarrollo/local
├── Dockerfile.prod         # Optimizado para producción
├── docker-compose.yml      # Desarrollo con PostgreSQL + Redis
├── .dockerignore          # Archivos a ignorar en Docker
├── deploy-to-acr.sh       # Script para desplegaar en Azure Container Registry
└── .github/workflows/
    └── build-and-push.yml # CI/CD automatizado con GitHub Actions
```

---

## 🛠️ Desarrollo Local

### Opción 1: Usando Docker Compose (RECOMENDADO)

Levanta toda la stack en un comando:

```bash
# Crear archivo .env local (si no existe)
cp .env.example .env

# Arrancar servicios (PostgreSQL + Redis + API)
docker-compose up -d

# Ver logs
docker-compose logs -f api

# Detener
docker-compose down
```

**Servicios levantados:**
- 🐘 PostgreSQL: `localhost:5432`
- 🔴 Redis: `localhost:6379`
- 🚀 API: `localhost:3000`

### Opción 2: Build Manual Local

```bash
# Build imagen local
docker build -t oroverde-api:dev .

# Ejecutar contenedor
docker run -it --rm \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/src:/app/src \
  oroverde-api:dev
```

---

## 🔨 Build para Producción

### Construcción y Testing Local

```bash
# Build usando Dockerfile.prod
docker build -f Dockerfile.prod -t oroverde-api:latest .

# Validar imagen (ejecutar contenedor)
docker run --rm \
  -p 3000:3000 \
  --env-file .env.production.azure \
  oroverde-api:latest

# Test: Verificar health check
curl http://localhost:3000/api/health

# Sacar tamaño de imagen
docker image ls oroverde-api:latest
```

### Optimizaciones Implementadas

✅ **Multi-stage Build**
- Stage 1 (builder): Incluye dev dependencies, compila TypeScript
- Stage 2 (runtime): Solo archivos necesarios, menor tamaño final

✅ **Usuario No-Root**
- Ejecución con usuario `nodejs` (uid 1001)
- Mayor seguridad, no permite escalación de privilegios

✅ **Health Check**
- Docker verifica cada 30s si la API responde
- Kubernetes/Azure pueden reiniciar automáticamente si falla

✅ **Dumb-init** (en Dockerfile.prod)
- Manejo correcto de signals (SIGTERM)
- Evita procesos zombie

✅ **Cache Buildkit**
- Reutiliza capas de Docker
- Build más rápido en CI/CD

**Tamaño esperado:**
- Con node:20-alpine: ~180-200 MB
- Comprimido en ACR: ~50-60 MB

---

## 🚀 Deployment en Azure

### Paso 1: Prepare Azure Resources

```bash
# Crear Container Registry
az acr create \
  --resource-group tu-rg \
  --name oroverde \
  --sku Basic

# Crear PostgreSQL Server (si no existe)
az postgres server create \
  --resource-group tu-rg \
  --name psql-oroverde-prod \
  --admin-user oroverde \
  --admin-password 'TuPassword123!' \
  --location northeurope

# Crear Redis Cache
az redis create \
  --resource-group tu-rg \
  --name redis-oroverde-prod \
  --location northeurope \
  --sku Basic \
  --vm-size c0
```

### Paso 2: Build y Push a ACR

#### Opción A: Script Manual
```bash
chmod +x deploy-to-acr.sh
./deploy-to-acr.sh oroverde oroverde-api v1.0.0
```

#### Opción B: GitHub Actions (AUTOMÁTICO)

1. Agregar secrets a GitHub:
   - `ACR_NAME`: `oroverde`
   - `ACR_USERNAME`: `tu-username`
   - `ACR_PASSWORD`: `tu-password`

2. Hacer push a rama `main` o `staging`:
```bash
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions automáticamente:
# - Build imagen
# - Corre tests
# - Push a ACR
# - Etiqueta como v1.0.0 y latest
```

### Paso 3: Desplegar en Azure App Service

```bash
# Crear App Service con imagen de ACR
az appservice plan create \
  --name oroverde-plan \
  --resource-group tu-rg \
  --sku B1 \
  --is-linux

az webapp create \
  --resource-group tu-rg \
  --plan oroverde-plan \
  --name oroverde-api \
  --deployment-container-image-name oroverde.azurecr.io/oroverde-api:latest

# Configurar imagen desde ACR
az webapp config container set \
  --name oroverde-api \
  --resource-group tu-rg \
  --docker-custom-image-name oroverde.azurecr.io/oroverde-api:latest \
  --docker-registry-server-url https://oroverde.azurecr.io \
  --docker-registry-server-user <ACR_USERNAME> \
  --docker-registry-server-password <ACR_PASSWORD>

# Configurar variables de entorno
az webapp config appsettings set \
  --resource-group tu-rg \
  --name oroverde-api \
  --settings \
    NODE_ENV=production \
    DB_HOST=psql-oroverde-prod.postgres.database.azure.com \
    DB_USER=oroverde@psql-oroverde-prod \
    DB_PASS=<tu-password> \
    REDIS_HOST=redis-oroverde-prod.northeurope.redis.azure.net \
    REDIS_PASSWORD=<tu-redis-key> \
    SESSION_SECRET=<tu-secret> \
    CSRF_SECRET=<tu-csrf> \
    ALLOWED_ORIGINS=https://tu-app-web.com
```

### Paso 4: Deploy en Azure Container Instances (alternativa)

```bash
# Desplegar instancia contenedor
az container create \
  --resource-group tu-rg \
  --name oroverde-api \
  --image oroverde.azurecr.io/oroverde-api:latest \
  --cpu 1 \
  --memory 1 \
  --port 3000 \
  --registry-login-server oroverde.azurecr.io \
  --registry-username <ACR_USERNAME> \
  --registry-password <ACR_PASSWORD> \
  --environment-variables \
    NODE_ENV=production \
    DB_HOST=psql-oroverde-prod.postgres.database.azure.com \
    REDIS_HOST=redis-oroverde-prod.northeurope.redis.azure.net
```

---

## 🔒 Seguridad

### Checklist de Seguridad para Producción

- [ ] **Usuario No-Root**: Ejecutar como `nodejs` (uid 1001)
  ```dockerfile
  USER nodejs
  ```

- [ ] **Secrets Management**:
  - ✗ NO hardcodear en Dockerfile
  - ✓ Usar Azure Key Vault
  - ✓ Inyectar vía variables de entorno en runtime

- [ ] **Base Image**
  - Usar `node:20-alpine` (sin apt, sin sudo)
  - Actualizar regularmente: `docker pull node:20-alpine`

- [ ] **Network Policies**
  - PostgreSQL: solo desde API
  - Redis: solo desde API
  - API: abierto al balanceador de carga en Azure

- [ ] **Health Checks**
  - Implementado en Dockerfile
  - Azure Container Instances/App Service respeta healthcheck

- [ ] **Logs y Monitoring**
  - Enviar logs a stdout/stderr
  - Azure Application Insights captura automáticamente
  - NO escribir a archivos locales (efímeros)

- [ ] **Límites de Recursos**
  ```bash
  # En local
  docker run --memory 512m --cpus 1 ...
  
  # En Azure (App Service)
  Mínimo B1 (1 CPU, 1.75 GB RAM)
  ```

---

## 🐛 Troubleshooting

### El contenedor se inicia pero muere

```bash
# Ver logs
docker-compose logs api

# O
docker logs <container-id>

# Soluciones comunes:
# 1. DATABASE_URL inválida → verificar DB_HOST, DB_PORT
# 2. Redis no responde → verificar REDIS_HOST, puerto
# 3. Health check fail → port 3000 no abierto internamente
```

### Conexión a PostgreSQL en Azure

```bash
# Verificar desde local
psql -h psql-oroverde-prod.postgres.database.azure.com \
     -U oroverde@psql-oroverde-prod \
     -d control_plane

# Nota: Azure requiere @servidor en username
```

### Conexión a Redis

```bash
# Si usas redis-cli local
redis-cli -h redis-oroverde-prod.northeurope.redis.azure.net \
          -p 10000 \
          --no-auth-warning \
          -a <tu-password> \
          ping
```

### Health Check falla

```bash
# Verificar que el endpoint /api/health existe
curl http://localhost:3000/api/health

# Debe retornar 200 con {"status":"ok"}
# Si connection refused → API no arrancó

# Debug en contenedor
docker exec <container-id> node -e "
  require('http').get('http://localhost:3000/api/health', 
    r => console.log(r.statusCode)
  )
"
```

### Imagen muy grande

```bash
# Analizar capas
docker history oroverde-api:latest

# Buscar archivos innecesarios
# - node_modules en builder: ✓ Normal
# - .git en dist: ✓ No existe
# - Test files: ✓ Ignorados en build

# Size check
docker image du oroverde-api:latest
```

---

## 📈 Monitoreo en Producción

### Application Insights (recomendado)

```typescript
// En main.ts después de crear app
import { ApplicationInsightsModule } from '@nestjs/azure-monitor';

@Module({
  imports: [
    ApplicationInsightsModule.forRoot({
      instrumentationKey: process.env.APPINSIGHTS_INSTRUMENTATIONKEY,
    }),
  ],
})
export class AppModule {}
```

### Métricas importantes

- `api_response_time` - Latencia
- `db_connection_pool` - Conexiones activas
- `redis_memory_usage` - Uso de Redis
- `error_rate` - % de endpoints fallando
- `health_check_status` - Estado del contenedor

---

## 🚀 Resumen - Flujo Típico

```
1. Desarrollo Local
   └─→ docker-compose up
   
2. Git Push a main/staging
   └─→ GitHub Actions:
       - npm ci
       - npm run build
       - npm run test
       - docker build -f Dockerfile.prod
       - docker push ACR
       
3. Deployment a Azure
   └─→ Actualizar App Service imagen
       │ (manualmente o vía webhook)
       │
       └─→ Azure reinicia contenedor
           - Descarga imagen de ACR
           - Variables de entorno desde Key Vault
           - Inicia proceso
           - Health check por 40s
           - Tráfico comienza a rutear
```

---

## 📚 Referencias

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Azure Container Registry](https://docs.microsoft.com/en-us/azure/container-registry/)
- [App Service Linux Containers](https://docs.microsoft.com/en-us/azure/app-service/containers/)
- [Security in Node.js Docker](https://docs.docker.com/language/nodejs/build-images/)
