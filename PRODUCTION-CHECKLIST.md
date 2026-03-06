# ✅ CHECKLIST DE PRODUCCIÓN - Oroverde API

## 🔐 SEGURIDAD

- [ ] **Secretos seguros generados**
  ```bash
  # SESSION_SECRET (mín 32 caracteres)
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  
  # CSRF_SECRET (mín 32 caracteres)
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- [ ] **Variables de entorno NO en código**
  - [ ] .env.production.azure creado desde .env.production.azure.example
  - [ ] .env nunca versionado en git
  - [ ] .gitignore contiene .env*

- [ ] **SSL/TLS configurado**
  - [ ] DB_HOST = Azure PostgreSQL (SSL obligatorio)
  - [ ] REDIS_TLS = true
  - [ ] REDIS_PORT = 10000 (puerto seguro Azure)
  - [ ] APP_URL = https://... (HTTPS)
  - [ ] ALLOWED_ORIGINS = localhost REMOVIDO
  - [ ] cookie.secure = true en producción

- [ ] **CORS Restrictivo**
  - [ ] ALLOWED_ORIGINS = solo dominios legítimos
  - [ ] NO usar wildcard (*)
  - [ ] credentials: true solo con dominios específicos

- [ ] **Autenticación fuerte**
  - [ ] bcrypt salt rounds = 10 mínimo (implementado)
  - [ ] Contraseñas temporal en email = generadas con crypto
  - [ ] Session secret = long random string
  - [ ] CSRF token = habilitado para POST/PUT/PATCH/DELETE

- [ ] **Usuario no-root en contenedor**
  - [ ] Dockerfile contiene `USER nodejs`
  - [ ] Archivos con propietario nodejs:nodejs

---

## 🐳 DOCKER

- [ ] **Dockerfile.prod existe y está optimizado**
  - [ ] Multi-stage build (builder + runtime)
  - [ ] node:20-alpine usado
  - [ ] Usuario no-root
  - [ ] Health check implementado

- [ ] **Imagen comprobada localmente**
  ```bash
  docker build -f Dockerfile.prod -t oroverde-api:test .
  docker run -p 3000:3000 --env-file .env.production.azure oroverde-api:test
  curl http://localhost:3000/api
  ```

- [ ] **.dockerignore contiene**
  - [ ] node_modules
  - [ ] dist
  - [ ] .env*
  - [ ] .git
  - [ ] .gitignore

- [ ] **Tamaño de imagen < 200 MB**
  ```bash
  docker image size oroverde-api:test
  ```

---

## 🚀 DEPLOYMENT EN AZURE

### Azure Resources Creados

- [ ] **Container Registry (ACR)**
  ```bash
  az acr list --output table
  ```
  - [ ] Nombre: oroverde
  - [ ] SKU: Basic o superior
  - [ ] Admin habilitado

- [ ] **PostgreSQL Server**
  ```bash
  az postgres server list --output table
  ```
  - [ ] Nombre: psql-oroverde-prod
  - [ ] SSL enforcement: ON
  - [ ] Firewall: Solo desde Azure
  - [ ] Backup: Habilitado (35 días mínimo)
  - [ ] Database creada: control_plane

- [ ] **Redis Cache**
  ```bash
  az redis list --output table
  ```
  - [ ] Nombre: redis-oroverde-prod
  - [ ] SKU: Premium (para producción)
  - [ ] SSL: Obligatorio
  - [ ] Firewall: Restringido a VNet

- [ ] **App Service o Container Instances**
  - [ ] Platform: Linux
  - [ ] Image: ACR registry
  - [ ] Always On: Enabled (App Service)
  - [ ] Health Check: /health (opcional, pero recomendado)

### Variables de Entorno Configuradas en Azure

- [ ] NODE_ENV=production
- [ ] DB_HOST=psql-oroverde-prod.postgres.database.azure.com
- [ ] DB_USER=oroverde@psql-oroverde-prod (nota: incluye @servidor)
- [ ] DB_PASS=... (desde Key Vault)
- [ ] DB_SSL=true
- [ ] REDIS_HOST=redis-oroverde-prod.northeurope.redis.azure.net
- [ ] REDIS_PORT=10000
- [ ] REDIS_TLS=true
- [ ] REDIS_PASSWORD=... (desde Key Vault)
- [ ] SESSION_SECRET=... (desde Key Vault)
- [ ] CSRF_SECRET=... (desde Key Vault)
- [ ] ALLOWED_ORIGINS=https://tu-app-web.com

### Key Vault

- [ ] **Secretos guardados en Azure Key Vault**
  ```bash
  az keyvault create --name oroverde-kv --resource-group tu-rg
  
  az keyvault secret set --vault-name oroverde-kv \
    --name DB-PASS --value "..."
  
  az keyvault secret set --vault-name oroverde-kv \
    --name REDIS-PASSWORD --value "..."
  
  az keyvault secret set --vault-name oroverde-kv \
    --name SESSION-SECRET --value "..."
  ```

- [ ] **App Service acceso a Key Vault**
  ```bash
  # Crear identity para App Service
  az webapp identity assign --name oroverde-api --resource-group tu-rg
  
  # Dar permisos de lectura en Key Vault
  az keyvault set-policy --name oroverde-kv --object-id <app-identity-id> \
    --secret-permissions get list
  ```

---

## 🧪 TESTING

- [ ] **Build local sin errores**
  ```bash
  npm run build
  # No hay errores de TypeScript
  ```

- [ ] **Linting pasado**
  ```bash
  npm run lint
  # 0 errores
  ```

- [ ] **Tests ejecutados**
  ```bash
  npm run test
  npm run test:cov
  # > 80% coverage
  ```

- [ ] **E2E tests en contenedor**
  ```bash
  docker-compose up -d
  npm run test:e2e
  # Todos pasan
  docker-compose down
  ```

- [ ] **Health check verificado**
  ```bash
  docker run -p 3000:3000 oroverde-api:latest &
  sleep 5
  curl http://localhost:3000/api/health
  # HTTP 200 esperado con {"status":"ok"}
  ```

---

## 📈 MONITORING

- [ ] **Application Insights configurado** (opcional pero recomendado)
  - [ ] APPINSIGHTS_INSTRUMENTATIONKEY en .env
  - [ ] Logs en Azure Portal

- [ ] **Logs accesibles**
  ```bash
  # App Service
  az webapp log tail --name oroverde-api --resource-group tu-rg
  
  # Container Instances
  az container logs --resource-group tu-rg --name oroverde-api
  ```

- [ ] **Alertas configuradas**
  - [ ] 500+ errors → Email admin
  - [ ] CPU > 80% → Notification
  - [ ] Memory > 80% → Notification
  - [ ] Health check falla → Auto-restart

---

## 📝 CI/CD

- [ ] **GitHub Actions workflow** (.github/workflows/build-and-push.yml)
  - [ ] Trigger en push a main/staging
  - [ ] Build Docker image
  - [ ] Push a ACR
  - [ ] Run tests
  - [ ] Run e2e tests

- [ ] **Secrets en GitHub**
  ```bash
  # Settings -> Secrets
  - ACR_NAME (tu-registry.azurecr.io)
  - ACR_USERNAME
  - ACR_PASSWORD
  ```

- [ ] **Deployment webhook** (opcional)
  - [ ] App Service recibe updates automáticamente
  - [ ] Webhook ACR → App Service

---

## 📊 PERFORMANCE

- [ ] **Imagen tamaño optimizado**
  - [ ] Alpine linux (no full OS)
  - [ ] Solo production dependencies
  - [ ] Esperado: 180-200 MB

- [ ] **Build time < 5 minutos** (GitHub Actions)
  - [ ] Caché de layers habilitado
  - [ ] npm ci (no npm install)

- [ ] **Startup time < 30 segundos**
  - [ ] Database migrations rápidas
  - [ ] No seed data pesado en producción

- [ ] **Memory footprint**
  - [ ] Mínimo: 1 GB RAM (B1 App Service)
  - [ ] Recomendado: 2 GB (P1v2)

---

## 🔄 ROLLBACK PLAN

- [ ] **Versiones de imagen etiquetadas**
  ```bash
  oroverde-api:v1.0.0
  oroverde-api:v1.0.1
  oroverde-api:latest
  # Guardar últimas 5 versiones en ACR
  ```

- [ ] **Database backups**
  - [ ] PostgreSQL: Automated backups cada 24h, retención 35 días
  - [ ] Manual backup antes de cambios críticos

- [ ] **Rollback procedure documentado**
  ```bash
  # Cambiar imagen en App Service
  az webapp config container set \
    --name oroverde-api \
    --docker-custom-image-name oroverde.azurecr.io/oroverde-api:v1.0.0
  
  # Esperar health check
  # Verificar en logs
  az webapp log tail --name oroverde-api
  ```

---

## 📋 DOCUMENTACIÓN

- [ ] **README.md actualizado** con:
  - [ ] Deployment instructions
  - [ ] Environment variables
  - [ ] Database schema
  - [ ] API endpoints

- [ ] **DOCKER-GUIDE.md** (en este repo)
  - [ ] Explicación de estructura Docker
  - [ ] Troubleshooting
  - [ ] Monitoreo

- [ ] **Architecture diagram** (opcional)
  - [ ] App Service ← ACR ← GitHub Actions
  - [ ] App Service → PostgreSQL (SSL)
  - [ ] App Service → Redis (TLS)

---

## ✅ FINAL CHECKLIST

- [ ] Todos los items anteriores completados
- [ ] Review de seguridad finalizado
- [ ] Performance testing OK
- [ ] Load testing OK (opcional)
- [ ] Disaster recovery plan documentado
- [ ] Team training completado
- [ ] On-call rotation establecida
- [ ] Rollback procedure practicado

---

**Fecha de último review:** ___________
**Preparado por:** ___________
**Aprobado por:** ___________
