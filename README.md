---
title: ASTraM API
emoji: 🚦
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# ASTraM Intelligence

Traffic event intelligence platform for Bengaluru — ML-powered event prediction, impact scoring, resource allocation, and a real-time command dashboard.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Next.js     │────▶│  FastAPI      │────▶│  ML Models      │
│  Dashboard   │◀────│  Backend      │◀────│  & Rule Engines │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │  PostgreSQL  │
                    │  / CSV Data  │
                    └─────────────┘
```

## Quick Start

### 1. Backend Setup
```bash
cd astram
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Prepare Data
```bash
# Copy your dataset into data/raw/
cp /path/to/dataset.csv data/raw/astram_events.csv

# Run preprocessing
python -m ml.preprocess

# Train ML model
python -m ml.train_event_model
```

### 3. Start API Server
```bash
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

| Route | Method | Description |
|---|---|---|
| `/predict-event` | POST | Predict event type for a location/time |
| `/impact-score` | POST | Calculate impact score for an event |
| `/allocate-resources` | POST | Get resource allocation recommendation |
| `/simulate-event` | POST | Full chained simulation (all models) |
| `/hotspots` | GET | Top incident hotspots |
| `/stats` | GET | Summary statistics |

## Tech Stack

- **ML**: scikit-learn (RandomForest), pandas
- **Backend**: FastAPI, uvicorn
- **Frontend**: Next.js, Leaflet
- **Data**: CSV (8,200+ Bengaluru traffic events)
