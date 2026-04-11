# KernelPulse Roadmap

## v1.1.0 — Alert Delivery
- [ ] Email alerts via SMTP when ANOMALY is detected
- [ ] Slack webhook integration
- [ ] Configurable thresholds via `.env` (no code change needed)
- [ ] Alert cooldown period (avoid alert storms)
- [ ] Alert persistence beyond server restart (SQLite)

## v1.2.0 — Security & Access Control
- [ ] HTTP Basic Auth with bcrypt password hashing
- [ ] Rate limiting per IP address
- [ ] HTTPS support with auto-generated self-signed certificate
- [ ] Optional read-only vs admin access levels

## v1.3.0 — Multi-Server Fleet
- [ ] Agent mode: lightweight KernelPulse instance reports to a central hub
- [ ] Fleet overview dashboard: all servers in one view
- [ ] Cross-server anomaly comparison
- [ ] Centralized alert log across all agents

## v2.0.0 — Predictive Intelligence
- [ ] Linear regression on rolling window -> predict metric value in 5 minutes
- [ ] Predictive alerts: warn before the threshold is actually hit
- [ ] 7-day and 30-day historical trend charts
- [ ] Prometheus-compatible `/metrics` endpoint for Grafana integration
- [ ] Export anomaly events to CSV/JSON
