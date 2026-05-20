function parseDate(raw) {
  if (!raw) return null;
  if (raw.includes("/")) {
    const [day, month, year] = raw.split("/");
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(raw);
}

function diffDays(target, today) {
  if (!target || Number.isNaN(target.getTime())) return 9999;
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
}

function estadoDesdeFacturas(facturas, today) {
  const pendientes = facturas.filter((f) => f.saldo_pendiente > 0);
  if (pendientes.length === 0) return "al_dia";
  const dias = pendientes.map((f) => diffDays(parseDate(f.fecha_vencimiento), today));
  if (dias.some((d) => d < 0)) return "vencida";
  if (dias.some((d) => d < 7)) return "por_vencer";
  return "al_dia";
}

function proveedorKey(proveedor) {
  return String(proveedor ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function proveedorCanonico(proveedor, canonicosPorKey) {
  const normalized = proveedorKey(proveedor);
  return canonicosPorKey.get(normalized) ?? String(proveedor ?? "").trim();
}

function buildResumenProveedores(
  facturas,
  pagos = [],
  imputaciones = [],
  today = new Date(),
  proveedoresCanonicos = [],
  movimientos = [],
) {
  const canonicosPorKey = new Map(
    proveedoresCanonicos.map((proveedor) => [proveedorKey(proveedor), proveedor]),
  );
  const aplicadoPorFactura = new Map();
  for (const imp of imputaciones) {
    const facturaId = String(imp.factura_id ?? "");
    aplicadoPorFactura.set(
      facturaId,
      (aplicadoPorFactura.get(facturaId) ?? 0) + Number(imp.monto_aplicado || 0),
    );
  }

  const pagosPorProveedor = new Map();
  for (const pago of pagos) {
    const proveedor = proveedorCanonico(pago.proveedor, canonicosPorKey);
    pagosPorProveedor.set(
      proveedor,
      (pagosPorProveedor.get(proveedor) ?? 0) + Number(pago.monto || 0),
    );
  }

  // Suma gastos directos por proveedor canónico (movimientos con monto negativo).
  const gastosPorProveedor = new Map();
  for (const mov of movimientos) {
    const monto = Number(mov.monto || 0);
    if (monto >= 0) continue;
    const proveedor = proveedorCanonico(mov.proveedor, canonicosPorKey);
    if (!proveedor) continue;
    gastosPorProveedor.set(
      proveedor,
      (gastosPorProveedor.get(proveedor) ?? 0) + Math.abs(monto),
    );
  }

  const grouped = new Map();
  for (const proveedor of proveedoresCanonicos) {
    grouped.set(proveedor, []);
  }
  for (const factura of facturas) {
    const proveedor = proveedorCanonico(factura.proveedor, canonicosPorKey);
    const monto = Number(factura.monto || 0);
    const montoPagado = Math.min(monto, aplicadoPorFactura.get(String(factura.id)) ?? 0);
    const facturaConSaldo = {
      ...factura,
      monto,
      monto_pagado: montoPagado,
      saldo_pendiente: Math.max(0, monto - montoPagado),
    };
    if (!grouped.has(proveedor)) grouped.set(proveedor, []);
    grouped.get(proveedor).push(facturaConSaldo);
  }

  return [...grouped.entries()]
    .map(([proveedor, facturasProveedor]) => {
      const totalFacturado = facturasProveedor.reduce((sum, f) => sum + f.monto, 0);
      const totalPagado = facturasProveedor.reduce((sum, f) => sum + f.monto_pagado, 0);
      const saldoPendiente = facturasProveedor.reduce((sum, f) => sum + f.saldo_pendiente, 0);
      const gastosDirectos = gastosPorProveedor.get(proveedor) ?? 0;
      return {
        proveedor,
        total_facturado: totalFacturado,
        total_pagado: totalPagado,
        pagos_registrados: pagosPorProveedor.get(proveedor) ?? 0,
        gastos_directos: gastosDirectos,
        total_movido: totalPagado + gastosDirectos,
        saldo_pendiente: saldoPendiente,
        estado: estadoDesdeFacturas(facturasProveedor, today),
        facturas: facturasProveedor.sort((a, b) => {
          const aDate = parseDate(a.fecha_vencimiento)?.getTime() ?? 0;
          const bDate = parseDate(b.fecha_vencimiento)?.getTime() ?? 0;
          return aDate - bDate;
        }),
      };
    })
    .sort((a, b) => {
      const aIndex = proveedoresCanonicos.findIndex((p) => proveedorKey(p) === proveedorKey(a.proveedor));
      const bIndex = proveedoresCanonicos.findIndex((p) => proveedorKey(p) === proveedorKey(b.proveedor));
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
          (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      }
      return b.saldo_pendiente - a.saldo_pendiente;
    });
}

function buildResumenIngresos(movimientos, desgloses = []) {
  const desglosePorMovimiento = new Map();
  for (const item of desgloses) {
    const movimientoId = String(item.movimiento_id ?? "");
    if (!desglosePorMovimiento.has(movimientoId)) {
      desglosePorMovimiento.set(movimientoId, []);
    }
    desglosePorMovimiento.get(movimientoId).push({
      forma: String(item.forma ?? ""),
      monto: Number(item.monto || 0),
    });
  }

  const grouped = new Map();
  for (const mov of movimientos) {
    const monto = Number(mov.monto || 0);
    if (monto <= 0) continue;
    const cuenta = String(mov.cuenta || "Sin cuenta");
    const fecha = String(mov.fecha || "");
    const fechaCarga = String(mov.fecha_carga || "");
    const key = `${fecha}__${fechaCarga}__${cuenta}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        fecha,
        fecha_carga: fechaCarga,
        cuenta,
        monto_total: 0,
        movimientos: [],
        desglose: [],
      });
    }
    const row = grouped.get(key);
    row.monto_total += monto;
    row.movimientos.push(mov);
    row.desglose.push(...(desglosePorMovimiento.get(String(mov.id)) ?? []));
  }

  return [...grouped.values()].map((row) => {
    const porForma = new Map();
    for (const item of row.desglose) {
      porForma.set(item.forma, (porForma.get(item.forma) ?? 0) + item.monto);
    }
    return {
      ...row,
      desglose: [...porForma.entries()].map(([forma, monto]) => ({ forma, monto })),
    };
  });
}

module.exports = {
  buildResumenIngresos,
  buildResumenProveedores,
};
