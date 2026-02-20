# IronClaw Supreme - Production Deployment Guide

## 🏭 **Enterprise-Grade Deployment**

This guide covers deploying IronClaw Supreme in production environments with enterprise-grade reliability, security, and monitoring.

## 🎯 **Production Architecture**

### **Recommended Infrastructure**
```
┌─────────────────────────────────────────┐
│              Production Stack           │
├─────────────────────────────────────────┤
│  Load Balancer │ Monitoring & Alerts    │
│  • Nginx/HAProxy │ • Prometheus         │
│  • SSL/TLS       │ • Grafana            │
│  • Rate Limiting │ • PagerDuty          │
├─────────────────────────────────────────┤
│  IronClaw Supreme │ Database & Storage   │
│  • Container/VM   │ • PostgreSQL        │
│  • Health Checks  │ • Redis Cache       │
│  • Auto-restart   │ • File Storage      │
├─────────────────────────────────────────┤
│  Infrastructure   │ Security & Backup   │  
│  • Docker/K8s     │ • WAF               │
│  • Auto-scaling   │ • Backup Strategy   │
│  • Log Aggregation│ • Secret Management │
└─────────────────────────────────────────┘
```

## 🚀 **Deployment Options**

### **Option 1: Docker Deployment (Recommended)**

#### **Production Dockerfile**
```dockerfile
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Chrome path for IronClaw
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy IronClaw Supreme
COPY . .

# Install with production optimizations
RUN npm ci --only=production

# Create non-root user
RUN addgroup -g 1001 -S openclaw && \
    adduser -S openclaw -u 1001

# Set up data directory
RUN mkdir -p /data/.openclaw && \
    chown -R openclaw:openclaw /data

USER openclaw

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s \
  CMD curl -f http://localhost:8080/health || exit 1

# Production startup
CMD ["./scripts/production-start.sh"]
```

#### **Docker Compose for Production**
```yaml
version: '3.8'
services:
  ironclaw-supreme:
    build: .
    restart: always
    ports:
      - "8080:8080"
    volumes:
      - ironclaw-data:/data
      - ./config/production.json:/app/config.json:ro
    environment:
      - NODE_ENV=production
      - IRONCLAW_DATA_DIR=/data
      - CHROME_ARGS=--no-sandbox --disable-dev-shm-usage
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 1G
          cpus: '0.5'

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx/production.conf:/etc/nginx/conf.d/default.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - ironclaw-supreme

volumes:
  ironclaw-data:
```

### **Option 2: Kubernetes Deployment**

#### **Production Kubernetes Manifest**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ironclaw-supreme
  labels:
    app: ironclaw-supreme
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ironclaw-supreme
  template:
    metadata:
      labels:
        app: ironclaw-supreme
    spec:
      containers:
      - name: ironclaw-supreme
        image: ironclaw-supreme:latest
        ports:
        - containerPort: 8080
        env:
        - name: NODE_ENV
          value: "production"
        - name: CHROME_ARGS
          value: "--no-sandbox --disable-dev-shm-usage"
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi" 
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: ironclaw-data
---
apiVersion: v1
kind: Service
metadata:
  name: ironclaw-supreme-service
spec:
  selector:
    app: ironclaw-supreme
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
```

## 🔧 **Production Configuration**

### **Environment Variables**
```bash
# Core Settings
NODE_ENV=production
IRONCLAW_LOG_LEVEL=info
IRONCLAW_DATA_DIR=/data/.openclaw

# Browser Hardening
CHROME_ARGS="--no-sandbox --disable-dev-shm-usage --disable-gpu --disable-extensions"
BROWSER_HIBERNATION=true
PROCESS_LIMIT=12

# Security
COMMUNITY_SKILLS_VALIDATION=true
AUDIT_LOGGING=true
API_FALLBACK_ENABLED=true

# Monitoring
HEALTH_CHECK_INTERVAL=30
METRICS_ENABLED=true
PROMETHEUS_PORT=9090

# Scaling
MAX_CONCURRENT_SESSIONS=10
MEMORY_LIMIT=2048
CPU_LIMIT=100
```

### **Production Config File**
```json
{
  "production": true,
  "logging": {
    "level": "info",
    "format": "json",
    "destination": "/data/logs/ironclaw.log"
  },
  "browser": {
    "hardening": true,
    "processLimit": 12,
    "hibernation": true,
    "memoryLimit": "1GB"
  },
  "security": {
    "communitySkillsValidation": true,
    "auditLogging": true,
    "rateLimiting": {
      "enabled": true,
      "requests": 100,
      "window": "15m"
    }
  },
  "monitoring": {
    "healthChecks": true,
    "metrics": true,
    "alerts": {
      "memoryThreshold": "1.5GB",
      "cpuThreshold": 80,
      "responseTime": "5s"
    }
  },
  "resilience": {
    "autoRestart": true,
    "fallbackProviders": ["anthropic", "openai", "gemini"],
    "circuitBreaker": {
      "enabled": true,
      "threshold": 5,
      "timeout": "30s"
    }
  }
}
```

## 📊 **Monitoring & Observability**

### **Key Metrics to Monitor**
```yaml
# Resource Usage
- name: memory_usage
  threshold: < 2GB
  alert: critical

- name: cpu_usage  
  threshold: < 80%
  alert: warning

- name: process_count
  threshold: < 15
  alert: info

# Application Health
- name: response_time
  threshold: < 5s
  alert: warning

- name: error_rate
  threshold: < 1%
  alert: critical

- name: uptime
  threshold: > 99.9%
  alert: critical

# IronClaw Specific  
- name: browser_crashes
  threshold: 0
  alert: critical

- name: skills_validation_failures
  threshold: < 5%
  alert: warning

- name: api_fallback_usage
  threshold: < 10%
  alert: info
```

### **Grafana Dashboard Example**
```json
{
  "dashboard": {
    "title": "IronClaw Supreme Production",
    "panels": [
      {
        "title": "Memory Usage vs OpenClaw",
        "type": "stat",
        "targets": [{
          "expr": "process_memory_bytes{job='ironclaw'}/1024/1024"
        }],
        "thresholds": [800, 1500, 2000]
      },
      {
        "title": "Chrome Process Count", 
        "type": "graph",
        "targets": [{
          "expr": "chrome_process_count{job='ironclaw'}"
        }],
        "yAxis": {"max": 30}
      },
      {
        "title": "API Provider Health",
        "type": "heatmap",
        "targets": [{
          "expr": "api_request_duration_seconds{job='ironclaw'}"
        }]
      }
    ]
  }
}
```

## 🛡️ **Security Hardening**

### **Production Security Checklist**
- [ ] **SSL/TLS**: HTTPS with valid certificates
- [ ] **Firewall**: Only necessary ports exposed  
- [ ] **WAF**: Web Application Firewall configured
- [ ] **Rate Limiting**: API and UI rate limits
- [ ] **Authentication**: Multi-factor authentication
- [ ] **Secrets**: Environment-based secret management
- [ ] **Audit Logging**: All actions logged and monitored
- [ ] **Updates**: Automated security updates
- [ ] **Backups**: Regular encrypted backups
- [ ] **Network**: Private network/VPN access only

### **Security Configuration**
```bash
# Network Security
iptables -A INPUT -p tcp --dport 8080 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 8080 -j DROP

# File Permissions
chown -R openclaw:openclaw /data/.openclaw
chmod 700 /data/.openclaw
chmod 600 /data/.openclaw/config.json

# Process Security
ulimit -n 1024
ulimit -u 100
```

## 📋 **Maintenance & Operations**

### **Daily Operations**
```bash
#!/bin/bash
# Daily maintenance script

# 1. Health Check
curl -f http://localhost:8080/health || exit 1

# 2. Resource Check
MEMORY=$(ps aux | grep openclaw | awk '{sum+=$6} END {print sum/1024}')
if [ "$MEMORY" -gt 2048 ]; then
  echo "High memory usage: ${MEMORY}MB"
  systemctl restart ironclaw
fi

# 3. Log Rotation
find /data/logs -name "*.log" -size +100M -exec gzip {} \;

# 4. Backup
rsync -av /data/.openclaw/ /backup/ironclaw/$(date +%Y%m%d)/
```

### **Scaling Strategy**
```yaml
# Horizontal Scaling
resources:
  - name: cpu_threshold
    value: 70%
    action: scale_up
    
  - name: memory_threshold  
    value: 1.5GB
    action: scale_up
    
  - name: response_time
    value: 3s
    action: scale_up

# Auto-scaling Configuration
min_replicas: 2
max_replicas: 10
scale_up_cooldown: 5m
scale_down_cooldown: 15m
```

## 🚨 **Disaster Recovery**

### **Backup Strategy**
```bash
# Daily Backup
0 2 * * * /opt/scripts/backup-ironclaw.sh

# Backup Script
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR="/backup/ironclaw/$DATE"

# Create backup
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/workspace.tar.gz" /data/.openclaw/workspace
tar -czf "$BACKUP_DIR/config.tar.gz" /data/.openclaw/config.json
tar -czf "$BACKUP_DIR/memory.tar.gz" /data/.openclaw/memory

# Upload to cloud storage
aws s3 cp "$BACKUP_DIR" s3://company-backups/ironclaw/ --recursive

# Cleanup old backups
find /backup/ironclaw -type d -mtime +30 -exec rm -rf {} \;
```

### **Recovery Procedures**
```bash
# Emergency Recovery
1. Stop services: systemctl stop ironclaw nginx
2. Restore from backup: tar -xzf /backup/latest/workspace.tar.gz
3. Verify configuration: ./scripts/health-check.js
4. Start services: systemctl start ironclaw nginx
5. Validate: curl -f http://localhost:8080/health
```

## 📈 **Performance Optimization**

### **Production Tuning**
```bash
# System Limits
echo "openclaw soft nofile 65536" >> /etc/security/limits.conf
echo "openclaw hard nofile 65536" >> /etc/security/limits.conf

# Kernel Parameters
echo "net.core.somaxconn = 1024" >> /etc/sysctl.conf
echo "vm.max_map_count = 262144" >> /etc/sysctl.conf

# Node.js Optimization
export NODE_OPTIONS="--max-old-space-size=1536"
export UV_THREADPOOL_SIZE=16
```

## 🎯 **Success Metrics**

Track these KPIs to measure production success:

- **💻 Resource Efficiency**: <1GB memory, <15 processes
- **⚡ Performance**: <2s response time, >99.9% uptime
- **🔒 Security**: 0 security incidents, 100% skill validation
- **📈 Reliability**: 0 crashes, <0.1% error rate

---

**Ready for Production?** Follow this guide step-by-step for enterprise-grade IronClaw Supreme deployment! 🚀