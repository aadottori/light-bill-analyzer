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

if __name__ == "__main__":
    import uvicorn
    import os
    
    # O Render disponibiliza a variável PORT (por padrão 10000, mas pode mudar).
    # O host 0.0.0.0 é obrigatório no Render para expor para fora do container.
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port)

