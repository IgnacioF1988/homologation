# Arquitectura DB-Centric - Homologation v2.0

## Vision General

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        ARQUITECTURA DB-CENTRIC                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│   ┌─────────────┐    WebSocket     ┌─────────────┐    Service     ┌────────┐│
│   │  FRONTEND   │◄────────────────│   BACKEND   │◄───Broker─────│   DB   ││
│   │  (React)    │     Push         │  (Node.js)  │    Push        │(SQL Srv)││
│   │  Reactivo   │                  │   Pasivo    │                │Orquesta ││
│   └─────────────┘                  └─────────────┘                └────────┘│
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Flujo de Ejecucion

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FLUJO DE EJECUCION                                     │
└──────────────────────────────────────────────────────────────────────────────┘

  FRONTEND                    BACKEND                         DATABASE
     │                           │                               │
     │ POST /pipeline/iniciar    │                               │
     │──────────────────────────>│                               │
     │                           │ EXEC sp_Iniciar_Pipeline      │
     │                           │──────────────────────────────>│
     │                           │                               │
     │                           │      ID_Ejecucion = 12345     │
     │                           │<──────────────────────────────│
     │       { success, id }     │                               │
     │<──────────────────────────│                               │
     │                           │                               │
     │ WS: SUBSCRIBE 12345       │                               │
     │──────────────────────────>│                               │
     │                           │                               │
     │                           │    ┌─────────────────────┐    │
     │                           │    │ DB procesa fondos   │    │
     │                           │    │ en paralelo         │    │
     │                           │    │                     │    │
     │                           │    │ sp_Process_IPA      │    │
     │                           │    │ sp_Process_CAPM     │    │
     │                           │    │ sp_Process_PNL      │    │
     │                           │    └─────────────────────┘    │
     │                           │                               │
     │                           │<── Service Broker ──┐         │
     │                           │    (SP_INICIO)      │         │
     │<── WS: FUND_UPDATE ───────│                     │         │
     │                           │                     │         │
     │                           │<── Service Broker ──┤         │
     │                           │    (SP_FIN)         │         │
     │<── WS: FUND_UPDATE ───────│                     │         │
     │                           │                     │         │
     │                           │<── Service Broker ──┤         │
     │                           │    (STANDBY)        │         │
     │<── WS: STANDBY_ACTIVATED ─│                     │         │
     │                           │                     │         │
     │                           │<── Service Broker ──┘         │
     │                           │    (PROCESO_FIN)              │
     │<── WS: EXECUTION_COMPLETE │                               │
     │                           │                               │
```

## Service Broker Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        SERVICE BROKER MESSAGING                               │
└──────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                           SQL SERVER                                     │
  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                    │
  │  │sp_Process_  │   │sp_Process_  │   │sp_Validate  │                    │
  │  │   IPA       │   │   CAPM      │   │   Fund      │                    │
  │  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                    │
  │         │                 │                 │                            │
  │         └────────────────┬┴─────────────────┘                            │
  │                          │                                               │
  │                          ▼                                               │
  │                 ┌─────────────────┐                                      │
  │                 │ sp_EmitirEvento │                                      │
  │                 └────────┬────────┘                                      │
  │                          │ SEND ON CONVERSATION                          │
  │                          ▼                                               │
  │                 ┌─────────────────┐                                      │
  │                 │ ETLEventQueue   │  (Service Broker Queue)              │
  │                 └────────┬────────┘                                      │
  └──────────────────────────┼───────────────────────────────────────────────┘
                             │
                             │ WAITFOR RECEIVE
                             ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                          NODE.JS BACKEND                                 │
  │                 ┌─────────────────────────┐                              │
  │                 │ ServiceBrokerListener   │                              │
  │                 └────────────┬────────────┘                              │
  │                              │                                           │
  │                              ▼                                           │
  │                 ┌─────────────────────────┐                              │
  │                 │   MessageProcessor      │                              │
  │                 └────────────┬────────────┘                              │
  │                              │                                           │
  │                              ▼                                           │
  │                 ┌─────────────────────────┐                              │
  │                 │   WebSocketManager      │                              │
  │                 └────────────┬────────────┘                              │
  └──────────────────────────────┼───────────────────────────────────────────┘
                                 │ WebSocket
                                 ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                          REACT FRONTEND                                  │
  │                 ┌─────────────────────────┐                              │
  │                 │ usePipelineWebSocket    │                              │
  │                 └────────────┬────────────┘                              │
  │                              │                                           │
  │                              ▼                                           │
  │                 ┌─────────────────────────┐                              │
  │                 │ PipelineExecutionView   │                              │
  │                 └─────────────────────────┘                              │
  └─────────────────────────────────────────────────────────────────────────┘
```

## Comparacion: Antes vs Ahora

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ANTES (Polling)                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│   Frontend ──polling──> Backend ──polling──> DB                              │
│      │                     │                  │                               │
│      │  GET /estado        │  SELECT estado   │                               │
│      │  cada 2 seg         │  cada 2 seg      │                               │
│      │                     │                  │                               │
│   Latencia: 2-4 segundos                                                      │
│   Carga DB: Alta (queries repetidas)                                          │
│   Complejidad: FundOrchestrator, Promise.all, TrackingService                │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                           AHORA (Push)                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│   Frontend <──push──── Backend <──push──── DB                                │
│      │                     │                  │                               │
│      │  WebSocket          │  Service Broker  │                               │
│      │  instantaneo        │  instantaneo     │                               │
│      │                     │                  │                               │
│   Latencia: <100ms                                                            │
│   Carga DB: Minima (solo eventos)                                             │
│   Complejidad: ServiceBrokerListener (simple)                                 │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Pipeline State Machine

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FUND STATE MACHINE                                     │
└──────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────┐
                         │   PENDING   │
                         └──────┬──────┘
                                │
                                ▼
                         ┌─────────────┐
                    ┌───>│ EXTRACTING  │
                    │    └──────┬──────┘
                    │           │
                    │           ▼
                    │    ┌─────────────┐
                    │    │ VALIDATING  │
                    │    └──────┬──────┘
                    │           │
                    │    ┌──────┴──────┐
                    │    │             │
                    │    ▼             ▼
                    │ ┌────────┐  ┌─────────┐
                    │ │STANDBY │  │PROCESSING│◄──────┐
                    │ └────┬───┘  └────┬────┘       │
                    │      │           │            │
                    │      │     ┌─────┴─────┐      │
                    │      │     │           │      │
                    │      │     ▼           ▼      │
                    │      │  ┌─────┐    ┌───────┐  │
                    │      │  │ERROR│    │RETRYING│─┘
                    │      │  └──┬──┘    └───────┘
                    │      │     │
                    │      │     │
                    │      ▼     │
                    │   ┌───────────────┐
                    │   │   RESUMED     │
                    │   └───────┬───────┘
                    │           │
                    └───────────┘
                                │
                                ▼
                         ┌─────────────┐
                         │  COMPLETED  │
                         └─────────────┘
```

## Estructura de Carpetas

```
homologation/
├── server/
│   ├── database/Refactor/
│   │   ├── BROKER/              # Service Broker
│   │   │   ├── 01_ServiceBroker_Setup.sql
│   │   │   ├── 02_sp_EmitirEvento.sql
│   │   │   └── 03_sp_CleanupConversations.sql
│   │   ├── CORE/                # SPs principales
│   │   │   ├── 00_Tables_*.sql
│   │   │   └── 02_sp_ValidateFund.sql
│   │   └── PIPELINE/            # SPs del pipeline
│   │       ├── 10_sp_Process_IPA.sql
│   │       ├── 20_sp_Process_CAPM.sql
│   │       └── ...
│   ├── services/
│   │   ├── broker/              # Service Broker listener
│   │   │   ├── ServiceBrokerListener.js
│   │   │   └── MessageProcessor.js
│   │   └── websocket/           # WebSocket manager
│   │       └── WebSocketManager.js
│   ├── routes/
│   │   └── pipeline.routes.js   # Endpoints REST
│   └── index.js                 # Entry point
├── src/
│   ├── hooks/
│   │   └── usePipelineWebSocket.js
│   └── components/
│       └── PipelineV2/
│           └── PipelineExecutionContainer.jsx
└── .claude/                     # Esta documentacion
    ├── README.md
    ├── DATABASE.md
    ├── BACKEND.md
    └── ARCHITECTURE.md
```
