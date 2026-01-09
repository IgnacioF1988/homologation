/**
 * Pipeline Routes - Endpoints REST (Arquitectura DB-Centric)
 *
 * ARQUITECTURA:
 * - La DB orquesta el pipeline via SPs existentes (staging.sp_ValidateFund, etc.)
 * - El backend es PASIVO: solo escucha eventos via Service Broker
 * - Estado en tiempo real: via Service Broker → WebSocket (NO polling REST)
 * - El frontend se suscribe via WebSocket para recibir eventos
 *
 * ENDPOINTS DISPONIBLES:
 * GET  /api/pipeline/broker/status - Estado del Service Broker
 * POST /api/pipeline/broker/test   - Enviar mensaje de prueba
 *
 * ESTADO EN TIEMPO REAL:
 * WebSocket: ws://localhost:3001/api/ws/pipeline
 * Ver: test-websocket.html para ejemplo de cliente
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../config/database');
const sql = require('mssql');

/**
 * GET /api/pipeline/broker/status
 * Obtener estado del Service Broker
 */
router.get('/broker/status', async (req, res) => {
  try {
    const serviceBrokerListener = require('../services/broker/ServiceBrokerListener');
    const pool = await getPool();

    // Estado del listener
    const listenerStatus = serviceBrokerListener.getStatus();

    // Estado del Service Broker en DB
    const dbStatus = await pool.request().query(`
      SELECT * FROM broker.vw_ServiceBrokerStatus
    `);

    res.json({
      success: true,
      data: {
        listener: listenerStatus,
        database: dbStatus.recordset[0] || null,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[Pipeline] Error obteniendo estado broker:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/pipeline/broker/test
 * Enviar mensaje de prueba al Service Broker
 */
router.post('/broker/test', async (req, res) => {
  try {
    const pool = await getPool();

    // Enviar mensaje de prueba via Service Broker
    await pool.request()
      .input('TipoEvento', sql.NVarChar(50), 'TEST')
      .input('ID_Ejecucion', sql.BigInt, 0)
      .input('ID_Proceso', sql.BigInt, 0)
      .input('ID_Fund', sql.Int, 0)
      .input('NombreSP', sql.NVarChar(128), 'test_from_api')
      .execute('broker.sp_EmitirEvento');

    console.log('[Pipeline] Mensaje de prueba enviado al Service Broker');

    res.json({
      success: true,
      message: 'Mensaje de prueba enviado. Verifica los logs del ServiceBrokerListener.',
    });

  } catch (error) {
    console.error('[Pipeline] Error enviando test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
