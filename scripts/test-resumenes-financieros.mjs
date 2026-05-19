import assert from "node:assert/strict";
import { test } from "node:test";
import resumenes from "../src/lib/resumenesFinancieros.js";

const { buildResumenIngresos, buildResumenProveedores } = resumenes;

test("buildResumenProveedores calcula pagos parciales y estado por proveedor", () => {
  const facturas = [
    {
      id: "f1",
      proveedor: "Carnes Sur",
      monto: 10000,
      fecha_vencimiento: "01/01/2024",
      fecha_carga: "02/01/2024",
    },
    {
      id: "f2",
      proveedor: "Carnes Sur",
      monto: 5000,
      fecha_vencimiento: "10/02/2026",
      fecha_carga: "03/01/2024",
    },
    {
      id: "f3",
      proveedor: "Verduras Norte",
      monto: 3000,
      fecha_vencimiento: "20/02/2026",
      fecha_carga: "04/01/2024",
    },
  ];
  const pagos = [{ id: "p1", proveedor: "Carnes Sur", monto: 9000 }];
  const imputaciones = [
    { pago_id: "p1", factura_id: "f1", monto_aplicado: 7000 },
    { pago_id: "p1", factura_id: "f2", monto_aplicado: 2000 },
  ];

  const resumen = buildResumenProveedores(
    facturas,
    pagos,
    imputaciones,
    new Date(2026, 0, 15),
  );

  assert.equal(resumen.length, 2);
  assert.equal(resumen[0].proveedor, "Carnes Sur");
  assert.equal(resumen[0].total_facturado, 15000);
  assert.equal(resumen[0].total_pagado, 9000);
  assert.equal(resumen[0].saldo_pendiente, 6000);
  assert.equal(resumen[0].estado, "vencida");
  assert.deepEqual(
    resumen[0].facturas.map((f) => ({
      id: f.id,
      pagado: f.monto_pagado,
      saldo: f.saldo_pendiente,
    })),
    [
      { id: "f1", pagado: 7000, saldo: 3000 },
      { id: "f2", pagado: 2000, saldo: 3000 },
    ],
  );
});

test("buildResumenIngresos agrupa por fecha y cuenta con desglose por forma", () => {
  const movimientos = [
    {
      id: "m1",
      fecha: "15/01/2026",
      fecha_carga: "16/01/2026",
      cuenta: "SANTANDER VALENCHO",
      monto: 12000,
    },
    {
      id: "m2",
      fecha: "15/01/2026",
      fecha_carga: "16/01/2026",
      cuenta: "SANTANDER VALENCHO",
      monto: 8000,
    },
    {
      id: "m3",
      fecha: "15/01/2026",
      fecha_carga: "16/01/2026",
      cuenta: "EFECTIVO",
      monto: -5000,
    },
  ];
  const desgloses = [
    { movimiento_id: "m1", cuenta: "SANTANDER VALENCHO", forma: "QR", monto: 7000 },
    { movimiento_id: "m1", cuenta: "SANTANDER VALENCHO", forma: "CREDITO", monto: 5000 },
    { movimiento_id: "m2", cuenta: "SANTANDER VALENCHO", forma: "DEBITO", monto: 8000 },
  ];

  const resumen = buildResumenIngresos(movimientos, desgloses);

  assert.equal(resumen.length, 1);
  assert.equal(resumen[0].fecha, "15/01/2026");
  assert.equal(resumen[0].fecha_carga, "16/01/2026");
  assert.equal(resumen[0].cuenta, "SANTANDER VALENCHO");
  assert.equal(resumen[0].monto_total, 20000);
  assert.deepEqual(resumen[0].desglose, [
    { forma: "QR", monto: 7000 },
    { forma: "CREDITO", monto: 5000 },
    { forma: "DEBITO", monto: 8000 },
  ]);
});
