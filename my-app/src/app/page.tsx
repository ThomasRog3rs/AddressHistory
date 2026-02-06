"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { getLastThreeYearGaps, getLastThreeYearsRange } from "@/lib/gaps";
import type { Address, DocumentMeta } from "@/lib/storage";

type AddressFormState = {
  line1: string;
  line2: string;
  town: string;
  county: string;
  postcode: string;
  country: string;
  startDate: string;
  endDate: string;
};

const emptyForm: AddressFormState = {
  line1: "",
  line2: "",
  town: "",
  county: "",
  postcode: "",
  country: "United Kingdom",
  startDate: "",
  endDate: "",
};

export default function Home() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [form, setForm] = useState<AddressFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<Record<string, File | null>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [exportRange, setExportRange] = useState(() =>
    getLastThreeYearsRange(),
  );

  const sortedAddresses = useMemo(
    () => [...addresses].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [addresses],
  );

  const gaps = useMemo(() => getLastThreeYearGaps(addresses), [addresses]);

  const documentsByAddress = useMemo(() => {
    const map = new Map<string, DocumentMeta[]>();
    for (const doc of documents) {
      const list = map.get(doc.addressId) ?? [];
      list.push(doc);
      map.set(doc.addressId, list);
    }
    return map;
  }, [documents]);

  async function refresh() {
    const response = await fetch("/api/addresses");
    if (!response.ok) {
      throw new Error("Unable to load addresses.");
    }
    const data = await response.json();
    setAddresses(data.addresses ?? []);
    setDocuments(data.documents ?? []);
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  function updateField<K extends keyof AddressFormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!form.line1 || !form.town || !form.postcode || !form.startDate) {
      setError("Line 1, town, postcode, and start date are required.");
      return;
    }

    if (form.endDate && form.endDate < form.startDate) {
      setError("End date must be after the start date.");
      return;
    }

    const payload = {
      ...form,
      endDate: form.endDate || undefined,
    };

    const response = await fetch(
      editingId ? `/api/addresses/${editingId}` : "/api/addresses",
      {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Unable to save address.");
      return;
    }

    await refresh();
    resetForm();
    setStatus(editingId ? "Address updated." : "Address added.");
  }

  function beginEdit(address: Address) {
    setEditingId(address.id);
    setForm({
      line1: address.line1,
      line2: address.line2 ?? "",
      town: address.town,
      county: address.county ?? "",
      postcode: address.postcode,
      country: address.country,
      startDate: address.startDate,
      endDate: address.endDate ?? "",
    });
  }

  async function removeAddress(id: string) {
    setError(null);
    setStatus(null);
    const shouldDelete = window.confirm(
      "Delete this address and its documents?",
    );
    if (!shouldDelete) {
      return;
    }
    const response = await fetch(`/api/addresses/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Unable to delete address.");
      return;
    }
    await refresh();
    setStatus("Address deleted.");
  }

  function setFile(addressId: string, file: File | null) {
    setPendingFiles((prev) => ({ ...prev, [addressId]: file }));
  }

  async function uploadDocument(addressId: string) {
    setError(null);
    setStatus(null);
    const file = pendingFiles[addressId];
    if (!file) {
      setError("Select a document to upload.");
      return;
    }
    const formData = new FormData();
    formData.append("addressId", addressId);
    formData.append("file", file);
    const response = await fetch("/api/documents", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Unable to upload document.");
      return;
    }
    setFile(addressId, null);
    await refresh();
    setStatus("Document uploaded.");
  }

  async function removeDocument(id: string) {
    setError(null);
    setStatus(null);
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Unable to delete document.");
      return;
    }
    await refresh();
    setStatus("Document deleted.");
  }

  const pdfUrl = `/api/export/pdf?start=${exportRange.start}&end=${exportRange.end}`;
  const zipUrl = `/api/export/zip?start=${exportRange.start}&end=${exportRange.end}`;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">UK Address History</h1>
          <p className="text-sm text-zinc-600">
            Track addresses, attach proof documents, and export a single PDF for
            applications.
          </p>
        </header>

        {(error || status) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error ?? status}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit address" : "Add new address"}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
                >
                  Cancel edit
                </button>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                Line 1 *
                <input
                  className="rounded-md border border-zinc-300 px-3 py-2"
                  value={form.line1}
                  onChange={(event) => updateField("line1", event.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Line 2
                <input
                  className="rounded-md border border-zinc-300 px-3 py-2"
                  value={form.line2}
                  onChange={(event) => updateField("line2", event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Town / City *
                <input
                  className="rounded-md border border-zinc-300 px-3 py-2"
                  value={form.town}
                  onChange={(event) => updateField("town", event.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                County
                <input
                  className="rounded-md border border-zinc-300 px-3 py-2"
                  value={form.county}
                  onChange={(event) =>
                    updateField("county", event.target.value)
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Postcode *
                <input
                  className="rounded-md border border-zinc-300 px-3 py-2"
                  value={form.postcode}
                  onChange={(event) =>
                    updateField("postcode", event.target.value)
                  }
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Country
                <input
                  className="rounded-md border border-zinc-300 px-3 py-2"
                  value={form.country}
                  onChange={(event) =>
                    updateField("country", event.target.value)
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Start date *
                <input
                  type="date"
                  className="rounded-md border border-zinc-300 px-3 py-2"
                  value={form.startDate}
                  onChange={(event) =>
                    updateField("startDate", event.target.value)
                  }
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                End date
                <input
                  type="date"
                  className="rounded-md border border-zinc-300 px-3 py-2"
                  value={form.endDate}
                  onChange={(event) =>
                    updateField("endDate", event.target.value)
                  }
                />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                {editingId ? "Update address" : "Add address"}
              </button>
              {editingId && (
                <span className="text-xs text-zinc-500">
                  Editing will update the existing entry.
                </span>
              )}
            </div>
          </form>

          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Coverage gaps (last 3 years)</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Highlighted gaps in address coverage for the last 3 years.
            </p>
            <div className="mt-4 space-y-2 text-sm">
              {gaps.length === 0 ? (
                <p className="text-emerald-700">
                  No gaps detected for the last 3 years.
                </p>
              ) : (
                gaps.map((gap) => (
                  <div
                    key={`${gap.start}-${gap.end}`}
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700"
                  >
                    {gap.start} to {gap.end}
                    {gap.isLeading && " (leading gap)"}
                    {gap.isTrailing && " (trailing gap)"}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Address list</h2>
            <span className="text-sm text-zinc-500">
              {sortedAddresses.length} entries
            </span>
          </div>

          <div className="mt-4 space-y-6">
            {sortedAddresses.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Add an address to begin tracking your history.
              </p>
            ) : (
              sortedAddresses.map((address) => {
                const docs = documentsByAddress.get(address.id) ?? [];
                return (
                  <div
                    key={address.id}
                    className="rounded-lg border border-zinc-200 p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-base font-semibold">
                          {address.line1}
                        </h3>
                        <p className="text-sm text-zinc-600">
                          {[address.line2, address.town, address.county]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                        <p className="text-sm text-zinc-600">
                          {address.postcode}, {address.country}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {address.startDate} to{" "}
                          {address.endDate ?? "Present"}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
                          type="button"
                          onClick={() => beginEdit(address)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-sm font-medium text-red-600 hover:text-red-700"
                          type="button"
                          onClick={() => removeAddress(address.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-md bg-zinc-50 p-3">
                      <h4 className="text-sm font-semibold">Documents</h4>
                      <div className="mt-2 space-y-2">
                        {docs.length === 0 ? (
                          <p className="text-xs text-zinc-500">
                            No documents uploaded yet.
                          </p>
                        ) : (
                          docs.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <a
                                className="truncate text-zinc-700 underline decoration-zinc-300"
                                href={`/api/documents/${doc.id}`}
                              >
                                {doc.originalName}
                              </a>
                              <button
                                type="button"
                                onClick={() => removeDocument(doc.id)}
                                className="text-xs font-medium text-red-600 hover:text-red-700"
                              >
                                Remove
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="file"
                          accept="application/pdf,image/png,image/jpeg"
                          className="text-xs"
                          onChange={(event) =>
                            setFile(address.id, event.target.files?.[0] ?? null)
                          }
                        />
                        <button
                          type="button"
                          onClick={() => uploadDocument(address.id)}
                          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                        >
                          Upload document
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Export</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Choose a date range and download a merged PDF or ZIP file.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              Export start
              <input
                type="date"
                className="rounded-md border border-zinc-300 px-3 py-2"
                value={exportRange.start}
                onChange={(event) =>
                  setExportRange((prev) => ({
                    ...prev,
                    start: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Export end
              <input
                type="date"
                className="rounded-md border border-zinc-300 px-3 py-2"
                value={exportRange.end}
                onChange={(event) =>
                  setExportRange((prev) => ({
                    ...prev,
                    end: event.target.value,
                  }))
                }
              />
            </label>
            <div className="flex flex-col justify-end">
              <a
                href={pdfUrl}
                className="rounded-md bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-zinc-800"
              >
                Download PDF
              </a>
            </div>
            <div className="flex flex-col justify-end">
              <a
                href={zipUrl}
                className="rounded-md border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Download ZIP
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
