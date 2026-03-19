"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SectionOption = { id: string; name: string };

type Props = {
  sections: SectionOption[];
  designationSuggestions: string[];
  employmentSuggestions: string[];
  initialShowAddBulk?: boolean;
  initialShowEditBulk?: boolean;
};

type AddRow = {
  id: string;
  name: string;
  staffid: string;
  priority: string;
  section: string;
  typeOfEmployment: string;
  level: string;
  designation: string;
};

type AddSummary = {
  received: number;
  created: number;
  updated: number;
  blocked: number;
};

type ApiStaff = {
  id: string | number;
  staffid: string;
  name: string;
  sectionId?: string | number | null;
  section?: { id: string | number; name?: string } | null;
  designation?: string;
  weeklyOff?: "sun" | "mon" | "tue" | "wed" | "thurs" | "fri" | "sat";
  level?: number;
  typeOfEmployment?: string;
  priority?: number;
};

type EditRow = {
  id: number;
  name: string;
  staffid: string;
  sectionId: string;
  designation: string;
  weeklyOff: "sun" | "mon" | "tue" | "wed" | "thurs" | "fri" | "sat";
  level: string;
  typeOfEmployment: "permanent" | "contract" | "monthly wages";
  priority: string;
  isActive: boolean;
};

type EditSummary = {
  updated: number;
};

const EMPLOYMENT_DEFAULTS: Record<string, string> = {
  permanent: "50",
  contract: "100",
  "monthly wages": "500",
};

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultPriorityForType(typeValue: string) {
  const key = typeValue.trim().toLowerCase();
  return EMPLOYMENT_DEFAULTS[key] ?? "50";
}

function normalizeEmployment(value: string) {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  if (raw === "permanent") return "permanent";
  if (raw === "contract") return "contract";
  if (raw === "monthly wages" || raw === "monthlywages" || raw === "monthly") return "monthly wages";
  return value.trim();
}

function normalizeTypeForEdit(value: string): "permanent" | "contract" | "monthly wages" {
  const normalized = normalizeEmployment(value);
  if (normalized === "contract") return "contract";
  if (normalized === "monthly wages") return "monthly wages";
  return "permanent";
}

function createAddRow(priority = "50"): AddRow {
  return {
    id: randomId(),
    name: "",
    staffid: "",
    priority,
    section: "",
    typeOfEmployment: "",
    level: "",
    designation: "",
  };
}

function makeEditRowFromStaff(staff: ApiStaff): EditRow | null {
  const id = Number(staff.id);
  if (!Number.isFinite(id)) return null;
  const sectionId = staff.sectionId ? String(staff.sectionId) : staff.section?.id ? String(staff.section.id) : "";
  return {
    id,
    name: staff.name ?? "",
    staffid: staff.staffid ?? "",
    sectionId,
    designation: staff.designation ?? "",
    weeklyOff: staff.weeklyOff ?? "sun",
    level: String(staff.level ?? 1),
    typeOfEmployment: normalizeTypeForEdit(staff.typeOfEmployment ?? "permanent"),
    priority: String(staff.priority ?? defaultPriorityForType(staff.typeOfEmployment ?? "permanent")),
    isActive: sectionId !== "",
  };
}

function rowsEqual(a: EditRow, b: EditRow) {
  return (
    a.name === b.name &&
    a.staffid === b.staffid &&
    a.sectionId === b.sectionId &&
    a.designation === b.designation &&
    a.weeklyOff === b.weeklyOff &&
    a.level === b.level &&
    a.typeOfEmployment === b.typeOfEmployment &&
    a.priority === b.priority &&
    a.isActive === b.isActive
  );
}

export default function BulkStaffSync({
  sections,
  designationSuggestions,
  employmentSuggestions,
  initialShowAddBulk = false,
  initialShowEditBulk = false,
}: Props) {
  const router = useRouter();

  const [showAddBulk, setShowAddBulk] = useState(initialShowAddBulk);
  const [showEditBulk, setShowEditBulk] = useState(initialShowEditBulk);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSummary, setAddSummary] = useState<AddSummary | null>(null);

  const [sameSection, setSameSection] = useState(true);
  const [sameEmployment, setSameEmployment] = useState(true);
  const [sameLevel, setSameLevel] = useState(true);
  const [sameDesignation, setSameDesignation] = useState(true);

  const [sharedSection, setSharedSection] = useState("");
  const [sharedType, setSharedType] = useState("permanent");
  const [sharedLevel, setSharedLevel] = useState("1");
  const [sharedDesignation, setSharedDesignation] = useState("");
  const [addRows, setAddRows] = useState<AddRow[]>([createAddRow(defaultPriorityForType("permanent"))]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterEmployeeName, setFilterEmployeeName] = useState("");
  const [filterStaffId, setFilterStaffId] = useState("");
  const [filterDesignation, setFilterDesignation] = useState("");
  const [filterSectionId, setFilterSectionId] = useState("");
  const [filterEmploymentType, setFilterEmploymentType] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "inactive">("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ApiStaff[]>([]);
  const searchAbortRef = useRef<AbortController | null>(null);

  const [editQueue, setEditQueue] = useState<EditRow[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState<EditSummary | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);

  useEffect(() => {
    setShowAddBulk(initialShowAddBulk);
  }, [initialShowAddBulk]);

  useEffect(() => {
    setShowEditBulk(initialShowEditBulk);
  }, [initialShowEditBulk]);

  function updatePrioritiesForSharedType(typeValue: string) {
    const defaultPriority = defaultPriorityForType(typeValue);
    setAddRows((prev) =>
      prev.map((row) => {
        const isDefaultPriority = row.priority === "" || row.priority === "50" || row.priority === "100" || row.priority === "500";
        return isDefaultPriority ? { ...row, priority: defaultPriority } : row;
      }),
    );
  }

  const cleanedAddRows = useMemo(() => {
    const seenIds = new Set<string>();
    const out: Array<{
      name: string;
      staffid: string;
      priority: number | undefined;
      section: string;
      typeOfEmployment: string;
      level: number | undefined;
      designation: string;
    }> = [];
    for (const row of addRows) {
      const name = row.name.trim();
      const staffid = row.staffid.trim().toUpperCase();
      if (!name && !staffid) continue;
      if (!name || !staffid) continue;
      if (seenIds.has(staffid)) continue;
      seenIds.add(staffid);
      const rowType = normalizeEmployment(sameEmployment ? sharedType : row.typeOfEmployment);
      const fallbackPriority = defaultPriorityForType(rowType || "permanent");
      const rowPriority = (row.priority || fallbackPriority).trim();
      const rowLevel = (sameLevel ? sharedLevel : row.level).trim();
      out.push({
        name,
        staffid,
        priority: rowPriority ? Number.parseInt(rowPriority, 10) : undefined,
        section: (sameSection ? sharedSection : row.section).trim(),
        typeOfEmployment: rowType,
        level: rowLevel ? Number.parseInt(rowLevel, 10) : undefined,
        designation: (sameDesignation ? sharedDesignation : row.designation).trim(),
      });
    }
    return out;
  }, [addRows, sameDesignation, sameEmployment, sameLevel, sameSection, sharedDesignation, sharedLevel, sharedSection, sharedType]);

  function updateAddRow(id: string, key: keyof AddRow, value: string) {
    setAddRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  function addAddRow() {
    const priority = defaultPriorityForType(sameEmployment ? sharedType : "permanent");
    setAddRows((prev) => [...prev, createAddRow(priority)]);
  }

  function removeAddRow(id: string) {
    setAddRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  function onAddRowKeyDown(e: KeyboardEvent<HTMLInputElement>, rowIndex: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (rowIndex === addRows.length - 1) {
      addAddRow();
    }
  }

  async function onBulkAddSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddBusy(true);
    setAddError(null);
    setAddSummary(null);

    if (cleanedAddRows.length === 0) {
      setAddError("Add at least one complete row with Staff ID and Name");
      setAddBusy(false);
      return;
    }
    if (sameSection && !sharedSection.trim()) {
      setAddError("Enter shared section");
      setAddBusy(false);
      return;
    }
    if (sameEmployment && !normalizeEmployment(sharedType)) {
      setAddError("Enter shared employment type");
      setAddBusy(false);
      return;
    }
    if (sameLevel && !sharedLevel.trim()) {
      setAddError("Enter shared level");
      setAddBusy(false);
      return;
    }

    const res = await fetch("/api/staff/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bulkAddSmart",
        sameSection,
        sameEmployment,
        sameLevel,
        sameDesignation,
        shared: {
          section: sharedSection.trim(),
          typeOfEmployment: normalizeEmployment(sharedType),
          level: sharedLevel ? Number.parseInt(sharedLevel, 10) : undefined,
          designation: sharedDesignation.trim(),
        },
        rows: cleanedAddRows,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      details?: string[];
      summary?: AddSummary;
    };

    if (!res.ok) {
      const message = data.details?.length ? `${data.error ?? "Bulk addition failed"}: ${data.details[0]}` : (data.error ?? "Bulk addition failed");
      setAddError(message);
      setAddBusy(false);
      return;
    }

    if (data.summary) setAddSummary(data.summary);
    setAddBusy(false);
    setAddRows([createAddRow(defaultPriorityForType(normalizeEmployment(sharedType) || "permanent"))]);
    router.refresh();
  }

  useEffect(() => {
    const query = searchQuery.trim();
    const hasOtherFilters = Boolean(
      filterEmployeeName.trim() ||
        filterStaffId.trim() ||
        filterDesignation.trim() ||
        filterSectionId ||
        filterEmploymentType.trim() ||
        filterStatus,
    );
    if (query.length === 0 && !hasOtherFilters) {
      searchAbortRef.current?.abort();
      setSearchResults([]);
      setSearchError(null);
      setSearchBusy(false);
      return;
    }

    const timeout = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchBusy(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (filterEmployeeName.trim()) params.set("employeeName", filterEmployeeName.trim());
        if (filterStaffId.trim()) params.set("staffId", filterStaffId.trim());
        if (filterDesignation.trim()) params.set("designation", filterDesignation.trim());
        if (filterSectionId) params.set("sectionId", filterSectionId);
        if (filterEmploymentType.trim()) params.set("typeOfEmployment", normalizeTypeForEdit(filterEmploymentType.trim()));
        if (filterStatus) params.set("status", filterStatus);
        const res = await fetch(`/api/staff?${params.toString()}`, { signal: controller.signal });
        const data = (await res.json().catch(() => ({}))) as { error?: string; staff?: ApiStaff[] };
        if (!res.ok) {
          setSearchError(data.error ?? "Search failed");
          setSearchResults([]);
          setSearchBusy(false);
          return;
        }
        setSearchResults(data.staff ?? []);
        setSearchBusy(false);
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") {
          return;
        }
        setSearchError("Search failed");
        setSearchBusy(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [filterDesignation, filterEmployeeName, filterEmploymentType, filterSectionId, filterStaffId, filterStatus, searchQuery]);

  function updateEditRow(id: number, key: keyof EditRow, value: string | boolean) {
    setEditQueue((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (key === "isActive") {
          const active = Boolean(value);
          return { ...row, isActive: active, sectionId: active ? row.sectionId : "" };
        }
        return { ...row, [key]: String(value) } as EditRow;
      }),
    );
  }

  function upsertEditedFromSearch(staff: ApiStaff, key: keyof EditRow, value: string | boolean) {
    const base = makeEditRowFromStaff(staff);
    if (!base) return;
    const existing = editQueue.find((row) => row.id === base.id) ?? base;
    let next: EditRow;
    if (key === "isActive") {
      const active = Boolean(value);
      next = { ...existing, isActive: active, sectionId: active ? existing.sectionId : "" };
    } else {
      next = { ...existing, [key]: String(value) } as EditRow;
    }
    setEditQueue((prev) => {
      const without = prev.filter((row) => row.id !== base.id);
      if (rowsEqual(next, base)) {
        return without;
      }
      return [...without, next];
    });
  }

  function resetEditedRow(staff: ApiStaff) {
    const base = makeEditRowFromStaff(staff);
    if (!base) return;
    setEditQueue((prev) => prev.filter((row) => row.id !== base.id));
  }

  function removeEditRow(id: number) {
    setEditQueue((prev) => prev.filter((row) => row.id !== id));
  }

  async function commitBulkEdits() {
    setCommitBusy(true);
    setEditError(null);
    setEditSummary(null);
    if (editQueue.length === 0) {
      setEditError("Add at least one staff record to edit");
      setCommitBusy(false);
      return;
    }

    const res = await fetch("/api/staff/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "commitBulkEdits",
        rows: editQueue.map((row) => ({
          id: row.id,
          staffid: row.staffid.trim().toUpperCase(),
          name: row.name.trim(),
          sectionId: row.sectionId,
          designation: row.designation.trim(),
          weeklyOff: row.weeklyOff,
          level: Number.parseInt(row.level || "1", 10),
          typeOfEmployment: row.typeOfEmployment,
          priority: Number.parseInt(row.priority || defaultPriorityForType(row.typeOfEmployment), 10),
          isActive: row.isActive,
        })),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; summary?: EditSummary };

    if (!res.ok) {
      setEditError(data.error ?? "Bulk edit failed");
      setCommitBusy(false);
      return;
    }
    if (data.summary) setEditSummary(data.summary);
    setCommitBusy(false);
    setPreviewOpen(false);
    router.refresh();
  }

  return (
    <div className="nac-card space-y-3 p-4">
      <div>
        <h2 className="nac-heading text-lg font-semibold">Bulk Addition</h2>
        <p className="text-sm text-slate-600">
          Choose what details are same, fill shared values once, then add all employees and submit together.
        </p>
      </div>

      {showAddBulk ? (
        <form onSubmit={onBulkAddSubmit} className="space-y-3 rounded-md border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Bulk Add Staff</h3>
            <button type="button" className="nac-btn-secondary px-2 py-1.5 text-xs" onClick={() => setShowAddBulk(false)}>
              Close
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={sameSection} onChange={(e) => setSameSection(e.target.checked)} />
              Same section for all
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={sameEmployment}
                onChange={(e) => {
                  setSameEmployment(e.target.checked);
                  if (e.target.checked) updatePrioritiesForSharedType(sharedType);
                }}
              />
              Same employment type for all
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={sameLevel} onChange={(e) => setSameLevel(e.target.checked)} />
              Same level for all
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={sameDesignation} onChange={(e) => setSameDesignation(e.target.checked)} />
              Same designation for all
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {sameSection ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Section</label>
                <input list="bulk-sections" className="nac-input" value={sharedSection} onChange={(e) => setSharedSection(e.target.value)} placeholder="Type section name" disabled={addBusy} />
              </div>
            ) : null}
            {sameEmployment ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Employment Type</label>
                <input
                  list="bulk-employment-types"
                  className="nac-input"
                  value={sharedType}
                  onChange={(e) => {
                    setSharedType(e.target.value);
                    if (sameEmployment) updatePrioritiesForSharedType(e.target.value);
                  }}
                  placeholder="Type employment type"
                  disabled={addBusy}
                />
              </div>
            ) : null}
            {sameLevel ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Level</label>
                <input type="number" min={1} max={10} className="nac-input" value={sharedLevel} onChange={(e) => setSharedLevel(e.target.value)} disabled={addBusy} />
              </div>
            ) : null}
            {sameDesignation ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Designation</label>
                <input list="bulk-designations" className="nac-input" value={sharedDesignation} onChange={(e) => setSharedDesignation(e.target.value)} placeholder="Type designation" disabled={addBusy} />
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="nac-table min-w-[1100px] w-full text-sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Staff ID</th>
                  {!sameSection ? <th>Section</th> : null}
                  {!sameEmployment ? <th>Employment Type</th> : null}
                  {!sameLevel ? <th>Level</th> : null}
                  {!sameDesignation ? <th>Designation</th> : null}
                  <th>Priority</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {addRows.map((row, index) => (
                  <tr key={row.id}>
                    <td><input className="nac-input" value={row.name} placeholder="Employee Name" onChange={(e) => updateAddRow(row.id, "name", e.target.value)} onKeyDown={(e) => onAddRowKeyDown(e, index)} disabled={addBusy} /></td>
                    <td><input className="nac-input" value={row.staffid} placeholder="Staff ID" onChange={(e) => updateAddRow(row.id, "staffid", e.target.value)} onKeyDown={(e) => onAddRowKeyDown(e, index)} disabled={addBusy} /></td>
                    {!sameSection ? <td><input list="bulk-sections" className="nac-input" value={row.section} placeholder="Section" onChange={(e) => updateAddRow(row.id, "section", e.target.value)} onKeyDown={(e) => onAddRowKeyDown(e, index)} disabled={addBusy} /></td> : null}
                    {!sameEmployment ? (
                      <td>
                        <input
                          list="bulk-employment-types"
                          className="nac-input"
                          value={row.typeOfEmployment}
                          placeholder="Employment type"
                          onChange={(e) => {
                            const value = e.target.value;
                            updateAddRow(row.id, "typeOfEmployment", value);
                            const defaultPriority = defaultPriorityForType(value);
                            setAddRows((prev) => prev.map((r) => (r.id === row.id && !r.priority ? { ...r, priority: defaultPriority } : r)));
                          }}
                          onKeyDown={(e) => onAddRowKeyDown(e, index)}
                          disabled={addBusy}
                        />
                      </td>
                    ) : null}
                    {!sameLevel ? <td><input className="nac-input" type="number" min={1} max={10} value={row.level} placeholder="Level" onChange={(e) => updateAddRow(row.id, "level", e.target.value)} onKeyDown={(e) => onAddRowKeyDown(e, index)} disabled={addBusy} /></td> : null}
                    {!sameDesignation ? <td><input list="bulk-designations" className="nac-input" value={row.designation} placeholder="Designation" onChange={(e) => updateAddRow(row.id, "designation", e.target.value)} onKeyDown={(e) => onAddRowKeyDown(e, index)} disabled={addBusy} /></td> : null}
                    <td><input className="nac-input" type="number" min={0} value={row.priority} placeholder={defaultPriorityForType(sameEmployment ? sharedType : row.typeOfEmployment)} onChange={(e) => updateAddRow(row.id, "priority", e.target.value)} onKeyDown={(e) => onAddRowKeyDown(e, index)} disabled={addBusy} /></td>
                    <td className="text-right"><button type="button" className="nac-btn-secondary px-2 py-2 text-xs" onClick={() => removeAddRow(row.id)} disabled={addBusy}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="nac-btn-secondary px-3 py-2 text-xs" onClick={addAddRow} disabled={addBusy}>Add Another Row</button>
          <p className="text-xs text-slate-600">Ready to submit: {cleanedAddRows.length}</p>
          {addError ? <p className="text-sm text-red-600">{addError}</p> : null}
          <div className="flex justify-end"><button type="submit" className="nac-btn-primary px-3 py-2" disabled={addBusy}>{addBusy ? "Saving..." : "Submit All"}</button></div>
          {addSummary ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p>Received: {addSummary.received}</p>
              <p>Created: {addSummary.created}</p>
              <p>Updated: {addSummary.updated}</p>
              <p>Blocked: {addSummary.blocked}</p>
            </div>
          ) : null}
        </form>
      ) : null}

      {showEditBulk ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div>
            <h3 className="text-sm font-semibold text-slate-800">Bulk Edit Existing Staff</h3>
            <p className="text-xs text-slate-600">Search with filters and edit directly in results. Changed rows are auto-added for final submit.</p>
            </div>
            <button type="button" className="nac-btn-secondary px-2 py-1.5 text-xs" onClick={() => setShowEditBulk(false)}>
              Close
            </button>
          </div>

        <div className="grid gap-2 md:grid-cols-3">
          <input className="nac-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search everything" />
          <input className="nac-input" value={filterEmployeeName} onChange={(e) => setFilterEmployeeName(e.target.value)} placeholder="Employee Name" />
          <input className="nac-input" value={filterStaffId} onChange={(e) => setFilterStaffId(e.target.value)} placeholder="Staff ID" />
          <input list="bulk-designations" className="nac-input" value={filterDesignation} onChange={(e) => setFilterDesignation(e.target.value)} placeholder="Designation" />
          <select className="nac-select" value={filterSectionId} onChange={(e) => setFilterSectionId(e.target.value)}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={`filter-sec-${s.id}`} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input list="bulk-employment-types" className="nac-input" value={filterEmploymentType} onChange={(e) => setFilterEmploymentType(e.target.value)} placeholder="Employment type" />
          <select className="nac-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "" | "active" | "inactive")}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {searchError ? <p className="text-sm text-red-600">{searchError}</p> : null}
        {searchBusy ? <p className="text-xs text-slate-500">Searching...</p> : null}

        {searchResults.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="nac-table min-w-[1400px] w-full text-sm">
              <thead>
                <tr><th>Name</th><th>Staff ID</th><th>Section</th><th>Designation</th><th>Weekly Off</th><th>Level</th><th>Type</th><th>Priority</th><th>Active</th><th>State</th></tr>
              </thead>
              <tbody>
                {searchResults.map((staff) => {
                  const base = makeEditRowFromStaff(staff);
                  if (!base) return null;
                  const changed = editQueue.find((q) => q.id === base.id);
                  const row = changed ?? base;
                  return (
                    <tr key={`${staff.id}`}>
                      <td><input className="nac-input" value={row.name} onChange={(e) => upsertEditedFromSearch(staff, "name", e.target.value)} /></td>
                      <td><input className="nac-input" value={row.staffid} onChange={(e) => upsertEditedFromSearch(staff, "staffid", e.target.value)} /></td>
                      <td>
                        <select className="nac-select" value={row.sectionId} onChange={(e) => upsertEditedFromSearch(staff, "sectionId", e.target.value)} disabled={!row.isActive}>
                          <option value="">Select section</option>
                          {sections.map((s) => (
                            <option key={`search-sec-${s.id}`} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td><input list="bulk-designations" className="nac-input" value={row.designation} onChange={(e) => upsertEditedFromSearch(staff, "designation", e.target.value)} /></td>
                      <td>
                        <select className="nac-select" value={row.weeklyOff} onChange={(e) => upsertEditedFromSearch(staff, "weeklyOff", e.target.value)}>
                          <option value="sun">Sunday</option><option value="mon">Monday</option><option value="tue">Tuesday</option><option value="wed">Wednesday</option><option value="thurs">Thursday</option><option value="fri">Friday</option><option value="sat">Saturday</option>
                        </select>
                      </td>
                      <td><input className="nac-input" type="number" min={1} max={10} value={row.level} onChange={(e) => upsertEditedFromSearch(staff, "level", e.target.value)} /></td>
                      <td>
                        <select className="nac-select" value={row.typeOfEmployment} onChange={(e) => upsertEditedFromSearch(staff, "typeOfEmployment", normalizeTypeForEdit(e.target.value))}>
                          <option value="permanent">Permanent</option><option value="contract">Contract</option><option value="monthly wages">Monthly Wages</option>
                        </select>
                      </td>
                      <td><input className="nac-input" type="number" min={0} value={row.priority} onChange={(e) => upsertEditedFromSearch(staff, "priority", e.target.value)} /></td>
                      <td className="text-center"><input type="checkbox" checked={row.isActive} onChange={(e) => upsertEditedFromSearch(staff, "isActive", e.target.checked)} /></td>
                      <td className="text-right">
                        {changed ? (
                          <button type="button" className="nac-btn-secondary px-2 py-1.5 text-xs" onClick={() => resetEditedRow(staff)}>
                            Reset
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">Unchanged</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">Queued edits: {editQueue.length}</p>
          <button type="button" className="nac-btn-primary px-3 py-2" disabled={editQueue.length === 0} onClick={() => setPreviewOpen(true)}>
            Preview & Submit
          </button>
        </div>

        {editQueue.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="nac-table min-w-[1300px] w-full text-sm">
              <thead>
                <tr><th>Name</th><th>Staff ID</th><th>Section</th><th>Designation</th><th>Weekly Off</th><th>Level</th><th>Type</th><th>Priority</th><th>Active</th><th /></tr>
              </thead>
              <tbody>
                {editQueue.map((row) => (
                  <tr key={row.id}>
                    <td><input className="nac-input" value={row.name} onChange={(e) => updateEditRow(row.id, "name", e.target.value)} /></td>
                    <td><input className="nac-input" value={row.staffid} onChange={(e) => updateEditRow(row.id, "staffid", e.target.value)} /></td>
                    <td>
                      <select className="nac-select" value={row.sectionId} onChange={(e) => updateEditRow(row.id, "sectionId", e.target.value)} disabled={!row.isActive}>
                        <option value="">Select section</option>
                        {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td><input list="bulk-designations" className="nac-input" value={row.designation} onChange={(e) => updateEditRow(row.id, "designation", e.target.value)} /></td>
                    <td>
                      <select className="nac-select" value={row.weeklyOff} onChange={(e) => updateEditRow(row.id, "weeklyOff", e.target.value)}>
                        <option value="sun">Sunday</option><option value="mon">Monday</option><option value="tue">Tuesday</option><option value="wed">Wednesday</option><option value="thurs">Thursday</option><option value="fri">Friday</option><option value="sat">Saturday</option>
                      </select>
                    </td>
                    <td><input className="nac-input" type="number" min={1} max={10} value={row.level} onChange={(e) => updateEditRow(row.id, "level", e.target.value)} /></td>
                    <td>
                      <select className="nac-select" value={row.typeOfEmployment} onChange={(e) => updateEditRow(row.id, "typeOfEmployment", normalizeTypeForEdit(e.target.value))}>
                        <option value="permanent">Permanent</option><option value="contract">Contract</option><option value="monthly wages">Monthly Wages</option>
                      </select>
                    </td>
                    <td><input className="nac-input" type="number" min={0} value={row.priority} onChange={(e) => updateEditRow(row.id, "priority", e.target.value)} /></td>
                    <td className="text-center"><input type="checkbox" checked={row.isActive} onChange={(e) => updateEditRow(row.id, "isActive", e.target.checked)} /></td>
                    <td className="text-right"><button type="button" className="nac-btn-secondary px-2 py-1.5 text-xs" onClick={() => removeEditRow(row.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
          {editSummary ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><p>Updated: {editSummary.updated}</p></div> : null}
        </section>
      ) : null}

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="nac-card max-h-[85vh] w-full max-w-7xl overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="nac-heading text-lg font-semibold">Preview Edited Staff</h3>
              <button type="button" className="nac-btn-secondary px-3 py-1.5 text-xs" onClick={() => setPreviewOpen(false)}>Close</button>
            </div>
            <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-200">
              <table className="nac-table min-w-[1300px] w-full text-sm">
                <thead>
                  <tr><th>Name</th><th>Staff ID</th><th>Section</th><th>Designation</th><th>Weekly Off</th><th>Level</th><th>Type</th><th>Priority</th><th>Active</th></tr>
                </thead>
                <tbody>
                  {editQueue.map((row) => (
                    <tr key={`preview-${row.id}`}>
                      <td><input className="nac-input" value={row.name} onChange={(e) => updateEditRow(row.id, "name", e.target.value)} /></td>
                      <td><input className="nac-input" value={row.staffid} onChange={(e) => updateEditRow(row.id, "staffid", e.target.value)} /></td>
                      <td>
                        <select className="nac-select" value={row.sectionId} onChange={(e) => updateEditRow(row.id, "sectionId", e.target.value)} disabled={!row.isActive}>
                          <option value="">Select section</option>
                          {sections.map((s) => <option key={`preview-${s.id}`} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td><input list="bulk-designations" className="nac-input" value={row.designation} onChange={(e) => updateEditRow(row.id, "designation", e.target.value)} /></td>
                      <td>
                        <select className="nac-select" value={row.weeklyOff} onChange={(e) => updateEditRow(row.id, "weeklyOff", e.target.value)}>
                          <option value="sun">Sunday</option><option value="mon">Monday</option><option value="tue">Tuesday</option><option value="wed">Wednesday</option><option value="thurs">Thursday</option><option value="fri">Friday</option><option value="sat">Saturday</option>
                        </select>
                      </td>
                      <td><input className="nac-input" type="number" min={1} max={10} value={row.level} onChange={(e) => updateEditRow(row.id, "level", e.target.value)} /></td>
                      <td>
                        <select className="nac-select" value={row.typeOfEmployment} onChange={(e) => updateEditRow(row.id, "typeOfEmployment", normalizeTypeForEdit(e.target.value))}>
                          <option value="permanent">Permanent</option><option value="contract">Contract</option><option value="monthly wages">Monthly Wages</option>
                        </select>
                      </td>
                      <td><input className="nac-input" type="number" min={0} value={row.priority} onChange={(e) => updateEditRow(row.id, "priority", e.target.value)} /></td>
                      <td className="text-center"><input type="checkbox" checked={row.isActive} onChange={(e) => updateEditRow(row.id, "isActive", e.target.checked)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="nac-btn-secondary px-3 py-2" onClick={() => setPreviewOpen(false)} disabled={commitBusy}>Back</button>
              <button type="button" className="nac-btn-primary px-3 py-2" onClick={commitBulkEdits} disabled={commitBusy}>{commitBusy ? "Submitting..." : "Final Submit"}</button>
            </div>
          </div>
        </div>
      ) : null}

      <datalist id="bulk-sections">{sections.map((s) => <option key={`sec-${s.id}`} value={s.name} />)}</datalist>
      <datalist id="bulk-employment-types">{employmentSuggestions.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="bulk-designations">{designationSuggestions.map((v) => <option key={v} value={v} />)}</datalist>
    </div>
  );
}
