import { google } from "googleapis";
import { Readable } from "node:stream";

function getDriveAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

function getDrive() {
  return google.drive({ version: "v3", auth: getDriveAuth() });
}

export type DriveUploadResult = {
  id: string;
  webViewLink: string;
  webContentLink: string;
};

/**
 * Sube un archivo binario a la carpeta GOOGLE_DRIVE_FOLDER_ID y lo deja con
 * permiso "anyone with the link" en modo lectura. Devuelve los links.
 *
 * La carpeta debe estar compartida con GOOGLE_SERVICE_ACCOUNT_EMAIL (rol Editor).
 */
export async function uploadInvoiceImage(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<DriveUploadResult> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID no está configurado");
  }

  const drive = getDrive();

  const created = await drive.files.create({
    requestBody: {
      name: filename,
      mimeType,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink, webContentLink",
    supportsAllDrives: true,
  });

  const id = created.data.id;
  if (!id) throw new Error("Drive no devolvió id del archivo subido");

  await drive.permissions
    .create({
      fileId: id,
      requestBody: { role: "reader", type: "anyone" },
      supportsAllDrives: true,
    })
    .catch(() => {
      /* si la carpeta ya define el permiso, ignorar */
    });

  return {
    id,
    webViewLink: created.data.webViewLink ?? `https://drive.google.com/file/d/${id}/view`,
    webContentLink: created.data.webContentLink ?? "",
  };
}

export function sanitizeFilename(base: string, mimeType: string): string {
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  const safe = base.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "factura";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safe}-${stamp}.${ext}`;
}
