import { google } from "googleapis";
import type {
  Movimiento,
  Cuenta,
  Cheque,
  FacturaProveedor,
} from "@/types";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) {
    throw new Error("GOOGLE_SHEET_ID no está configurado en las variables de entorno");
  }
  return id;
}

function diffDays(target: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function parseDate(raw: string): Date {
  if (raw.includes("/")) {
    const [day, month, year] = raw.split("/");
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(raw);
}

export async function getMovimientos(): Promise<Movimiento[]> {
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: "'Libro diario'!A2:H",
    });

    const rows = res.data.values ?? [];

    return rows.map((row, i) => ({
      id: String(i + 1),
      fecha: row[0] ?? "",
      monto: Number(row[1]) || 0,
      proveedor: row[2] ?? "",
      categoria: row[3] ?? "",
      comentario: row[4] ?? "",
      tipo_comprobante: row[5] ?? "",
      numero_comprobante: row[6] ?? "",
      fecha_vencimiento: row[7] ?? "",
    }));
  } catch (error) {
    console.error("Error fetching movimientos:", error);
    throw error;
  }
}

export async function appendMovimiento(
  mov: Omit<Movimiento, "id">
): Promise<void> {
  try {
    const sheets = getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId(),
      range: "'Libro diario'!A:H",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            mov.fecha,
            mov.monto,
            mov.proveedor,
            mov.categoria,
            mov.comentario,
            mov.tipo_comprobante,
            mov.numero_comprobante,
            mov.fecha_vencimiento,
          ],
        ],
      },
    });
  } catch (error) {
    console.error("Error appending movimiento:", error);
    throw error;
  }
}

export async function getCuentas(): Promise<Cuenta[]> {
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: "'Cuentas '!A2:B",
    });

    const rows = res.data.values ?? [];

    return rows.map((row) => ({
      nombre: row[0] ?? "",
      saldo: Number(row[1]) || 0,
    }));
  } catch (error) {
    console.error("Error fetching cuentas:", error);
    throw error;
  }
}

export async function getCheques(): Promise<Cheque[]> {
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: "'cheques'!A2:D",
    });

    const rows = res.data.values ?? [];

    return rows.map((row, i) => {
      const fechaVencimiento = row[3] ?? "";
      const dias = diffDays(parseDate(fechaVencimiento));

      let estado: Cheque["estado"];
      if (dias < 5) estado = "urgente";
      else if (dias < 10) estado = "esta_semana";
      else estado = "tiempo";

      return {
        id: String(i + 1),
        proveedor: row[1] ?? "",
        monto: Number(row[2]) || 0,
        fecha_vencimiento: fechaVencimiento,
        estado,
      };
    });
  } catch (error) {
    console.error("Error fetching cheques:", error);
    throw error;
  }
}

export async function getFacturasProveedores(): Promise<FacturaProveedor[]> {
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: "'proveedores'!A2:D",
    });

    const rows = res.data.values ?? [];

    return rows.map((row, i) => {
      const fechaVencimiento = row[3] ?? "";
      const dias = diffDays(parseDate(fechaVencimiento));

      let estado: FacturaProveedor["estado"];
      if (dias < 0) estado = "vencida";
      else if (dias < 7) estado = "por_vencer";
      else estado = "al_dia";

      return {
        id: String(i + 1),
        proveedor: row[1] ?? "",
        monto: Number(row[2]) || 0,
        fecha_vencimiento: fechaVencimiento,
        estado,
      };
    });
  } catch (error) {
    console.error("Error fetching facturas de proveedores:", error);
    throw error;
  }
}
