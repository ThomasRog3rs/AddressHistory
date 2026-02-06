import { promises as fs } from "fs";
import path from "path";

export type Address = {
  id: string;
  line1: string;
  line2?: string;
  town: string;
  county?: string;
  postcode: string;
  country: string;
  startDate: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentMeta = {
  id: string;
  addressId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type Store = {
  addresses: Address[];
  documents: DocumentMeta[];
};

const dataDir = path.join(process.cwd(), "data");
const uploadsDir = path.join(dataDir, "uploads");
const storePath = path.join(dataDir, "store.json");

const emptyStore: Store = { addresses: [], documents: [] };

export async function ensureDataDirs() {
  await fs.mkdir(uploadsDir, { recursive: true });
}

export function getUploadsDir() {
  return uploadsDir;
}

export function getStorePath() {
  return storePath;
}

export function getUploadPath(document: DocumentMeta) {
  return path.join(uploadsDir, document.storedName);
}

export async function readStore(): Promise<Store> {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as Store;
    return {
      addresses: parsed.addresses ?? [],
      documents: parsed.documents ?? [],
    };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      await writeStore(emptyStore);
      return emptyStore;
    }
    throw error;
  }
}

export async function writeStore(store: Store) {
  await ensureDataDirs();
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");
}

export function sortAddresses(addresses: Address[]) {
  return [...addresses].sort((a, b) => {
    if (a.startDate === b.startDate) {
      return a.createdAt.localeCompare(b.createdAt);
    }
    return a.startDate.localeCompare(b.startDate);
  });
}

export async function createAddress(input: Omit<Address, "id" | "createdAt" | "updatedAt">) {
  const store = await readStore();
  const now = new Date().toISOString();
  const address: Address = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  store.addresses.push(address);
  await writeStore(store);
  return address;
}

export async function updateAddress(
  id: string,
  updates: Partial<Omit<Address, "id" | "createdAt" | "updatedAt">>,
) {
  const store = await readStore();
  const index = store.addresses.findIndex((address) => address.id === id);
  if (index < 0) {
    return null;
  }
  const updated: Address = {
    ...store.addresses[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  store.addresses[index] = updated;
  await writeStore(store);
  return updated;
}

export async function deleteAddress(id: string) {
  const store = await readStore();
  const remainingAddresses = store.addresses.filter((address) => address.id !== id);
  const removedDocuments = store.documents.filter((doc) => doc.addressId === id);
  const remainingDocuments = store.documents.filter((doc) => doc.addressId !== id);
  for (const doc of removedDocuments) {
    await deleteUploadFile(doc);
  }
  await writeStore({ addresses: remainingAddresses, documents: remainingDocuments });
}

function resolveExtension(originalName: string, mimeType: string) {
  const ext = path.extname(originalName);
  if (ext) {
    return ext;
  }
  if (mimeType === "application/pdf") {
    return ".pdf";
  }
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  return "";
}

export async function createDocument({
  addressId,
  originalName,
  mimeType,
  size,
  data,
}: {
  addressId: string;
  originalName: string;
  mimeType: string;
  size: number;
  data: ArrayBuffer;
}) {
  const store = await readStore();
  const id = crypto.randomUUID();
  const storedName = `${id}${resolveExtension(originalName, mimeType)}`;
  const filePath = path.join(uploadsDir, storedName);
  await fs.writeFile(filePath, Buffer.from(data));
  const document: DocumentMeta = {
    id,
    addressId,
    originalName,
    storedName,
    mimeType,
    size,
    uploadedAt: new Date().toISOString(),
  };
  store.documents.push(document);
  await writeStore(store);
  return document;
}

export async function deleteDocument(id: string) {
  const store = await readStore();
  const document = store.documents.find((doc) => doc.id === id);
  if (!document) {
    return null;
  }
  await deleteUploadFile(document);
  const remaining = store.documents.filter((doc) => doc.id !== id);
  await writeStore({ addresses: store.addresses, documents: remaining });
  return document;
}

export async function deleteUploadFile(document: DocumentMeta) {
  const filePath = getUploadPath(document);
  try {
    await fs.unlink(filePath);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
}

export async function getDocumentById(id: string) {
  const store = await readStore();
  return store.documents.find((doc) => doc.id === id) ?? null;
}
