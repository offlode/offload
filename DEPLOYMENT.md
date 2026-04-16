# Offload — Deployment Guide

## Architecture Overview

| Component | Stack | Port | Status |
|-----------|-------|------|--------|
| Customer App + API | Express + React + SQLite | 5000 | Ready |
| Admin Portal | Express + React + SQLite | 5001 | Ready |
| Marketing Website | Static HTML/CSS/JS | 3000 | Ready |

## Pre-Launch Checklist

### Required API Keys
- [ ] **Stripe** — Create account at stripe.com, get `STRIPE_SECRET_KEY` and set up webhook endpoint for `STRIPE_WEBHOOK_SECRET`
- [ ] **SendGrid** — Create account at sendgrid.com, get `SENDGRID_API_KEY`, verify sender domain (offloadusa.com)
- [ ] **Cloud storage** — Set up AWS S3 bucket for photo uploads (or use Cloudflare R2)

### Domain Setup
- [ ] Point `offloadusa.com` → marketing site
- [ ] Point `app.offloadusa.com` → customer app (port 5000)
- [ ] Point `admin.offloadusa.com` → admin portal (port 5001)
- [ ] Set up SSL certificates (Let's Encrypt or Cloudflare)

### Database Migration
- [ ] For production scale: migrate from SQLite to PostgreSQL
- [ ] Current SQLite is fine for pilot (<1000 concurrent users)

### Environment Setup
1. Copy `.env.example` to `.env`
2. Fill in all required values
3. Set `NODE_ENV=production`
4. Set `ENFORCE_PHOTOS=true` when ready to require photo proof

## Build & Deploy

```bash
# Build
cd offload && npm run build

# Start production server
NODE_ENV=production node dist/index.cjs

# Or with PM2 (recommended)
pm2 start dist/index.cjs --name offload-api
pm2 start dist/index.cjs --name offload-admin -- --port 5001
```

## Monitoring

- Health check: `GET /api/health`
- Rate limits: 5/min registration, 20/min orders, 30/min messages
- Idempotency: Include `Idempotency-Key` header on POST/PATCH requests

## Security Features Active
- BOLA protection on all user-specific endpoints
- FSM actor enforcement on order state transitions
- Stripe webhook signature verification
- Scrypt password hashing (with SHA-256 legacy support)
- Rate limiting per-route per-IP
- Request body size limit (1MB)
- Input sanitization
- Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
