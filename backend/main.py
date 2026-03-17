from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import engine, Base

from backend.routes.bills import router as bills_router
from backend.routes.units import router as units_router
from backend.routes.analytics import router as analytics_router
from backend.routes.auth_routes import router as auth_router

# Criar tabelas no banco de dados
Base.metadata.create_all(bind=engine)

app = FastAPI(title="UFRJ PDF Parser API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(bills_router)
app.include_router(units_router)
app.include_router(analytics_router)
app.include_router(auth_router)
