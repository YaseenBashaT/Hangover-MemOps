# Dependency Graph

## Most Imported Files (change these carefully)

- `frontend/src/api.js` — imported by **6** files
- `frontend/src/components/ui.jsx` — imported by **3** files
- `frontend/src/components/MemifyCard.jsx` — imported by **2** files
- `frontend/src/pages/Dashboard.jsx` — imported by **1** files
- `frontend/src/pages/NewAlert.jsx` — imported by **1** files
- `frontend/src/pages/IncidentDetail.jsx` — imported by **1** files
- `frontend/src/App.jsx` — imported by **1** files
- `frontend/src/components/GraphView.jsx` — imported by **1** files
- `frontend/src/components/ScoreRing.jsx` — imported by **1** files

## Import Map (who imports what)

- `frontend/src/api.js` ← `frontend/src/components/GraphView.jsx`, `frontend/src/components/MemifyCard.jsx`, `frontend/src/components/ui.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/IncidentDetail.jsx` +1 more
- `frontend/src/components/ui.jsx` ← `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/IncidentDetail.jsx`, `frontend/src/pages/NewAlert.jsx`
- `frontend/src/components/MemifyCard.jsx` ← `frontend/src/pages/IncidentDetail.jsx`, `frontend/src/pages/NewAlert.jsx`
- `frontend/src/pages/Dashboard.jsx` ← `frontend/src/App.jsx`
- `frontend/src/pages/NewAlert.jsx` ← `frontend/src/App.jsx`
- `frontend/src/pages/IncidentDetail.jsx` ← `frontend/src/App.jsx`
- `frontend/src/App.jsx` ← `frontend/src/main.jsx`
- `frontend/src/components/GraphView.jsx` ← `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/ScoreRing.jsx` ← `frontend/src/pages/NewAlert.jsx`
