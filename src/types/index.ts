export interface Movimiento {
  id: string;
  fecha: string;
  fecha_carga: string;
  cuenta: string;
  monto: number;
  proveedor: string;
  categoria: string;
  comentario: string;
  tipo_comprobante: string;
  numero_comprobante: string;
  fecha_vencimiento: string;
}

export interface Cuenta {
  nombre: string;
  saldo: number;
}

export interface Cheque {
  id: string;
  proveedor: string;
  monto: number;
  fecha_vencimiento: string;
  estado: "urgente" | "esta_semana" | "tiempo";
}

export interface FacturaProveedor {
  id: string;
  referencia: string;
  proveedor: string;
  monto: number;
  monto_pagado?: number;
  saldo_pendiente?: number;
  fecha_vencimiento: string;
  fecha_carga: string;
  foto_url?: string;
  estado: "vencida" | "por_vencer" | "al_dia";
}

export interface PagoProveedor {
  id: string;
  fecha: string;
  fecha_carga: string;
  proveedor: string;
  cuenta: string;
  monto: number;
  comentario: string;
}

export interface PagoFactura {
  id: string;
  pago_id: string;
  factura_id: string;
  monto_aplicado: number;
}

export interface IngresoDesglose {
  id: string;
  movimiento_id: string;
  cuenta: string;
  forma: string;
  monto: number;
}

export interface ResumenProveedor {
  proveedor: string;
  total_facturado: number;
  total_pagado: number;
  pagos_registrados: number;
  saldo_pendiente: number;
  estado: FacturaProveedor["estado"];
  facturas: Array<FacturaProveedor & { monto_pagado: number; saldo_pendiente: number }>;
}

export interface ResumenIngreso {
  fecha: string;
  fecha_carga: string;
  cuenta: string;
  monto_total: number;
  movimientos: Movimiento[];
  desglose: Array<{ forma: string; monto: number }>;
}

export type UserRole = "admin" | "empleado";
