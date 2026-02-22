export const normalizeGroupKey = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
};

export const normalizeExtrasGroupSelection = (raw) => {
  const ids = new Set();
  const names = new Set();

  const addId = (value) => {
    const num = Number(value);
    if (Number.isFinite(num)) ids.add(num);
  };

  const addName = (value) => {
    const norm = normalizeGroupKey(value);
    if (norm) names.add(norm);
  };

  const process = (entry) => {
    if (entry === null || entry === undefined) return;

    if (Array.isArray(entry)) {
      entry.forEach(process);
      return;
    }

    if (typeof entry === "object") {
      if (Array.isArray(entry.ids) || Array.isArray(entry.names)) {
        if (Array.isArray(entry.ids)) entry.ids.forEach(addId);
        if (Array.isArray(entry.names)) entry.names.forEach(addName);
      } else {
        if (entry.id !== undefined) addId(entry.id);
        addName(entry.group_name ?? entry.groupName ?? entry.name ?? entry.slug ?? entry.label ?? entry.title);
      }
      return;
    }

    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (!trimmed) return;

      if (
        (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
        (trimmed.startsWith("{") && trimmed.endsWith("}"))
      ) {
        try {
          const parsed = JSON.parse(trimmed);
          process(parsed);
          return;
        } catch {
          // fallthrough
        }
      }

      if (trimmed.includes(",") || trimmed.includes(";")) {
        trimmed
          .split(/[;,]/)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach(process);
        return;
      }

      addId(trimmed);
      addName(trimmed);
      return;
    }

    if (typeof entry === "number") {
      addId(entry);
      return;
    }

    const asString = String(entry).trim();
    if (!asString) return;
    addId(asString);
    addName(asString);
  };

  process(raw);

  return {
    ids: Array.from(ids),
    names: Array.from(names),
  };
};
