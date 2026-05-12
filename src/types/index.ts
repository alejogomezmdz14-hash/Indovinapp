export interface Movimiento {
  id: string;
  fecha: string;
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
  proveedor: string;
  monto: number;
  fecha_vencimiento: string;
  estado: "vencida" | "por_vencer" | "al_dia";
}

export type UserRole = "admin" | "empleado";
