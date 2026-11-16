let projects = [];

export async function loadProjects() {
  projects = await (await fetch("projects/manifest.json")).json();
  return projects;
}

export async function loadInfluences() {
  return (await fetch("influences/manifest.json")).json();
}

export function getProjects() {
  return projects;
}

export function findProject(id) {
  return projects.find(p => p.id === id);
}

export function projectUrl(id) {
  return `project.html?id=${encodeURIComponent(id)}`;
}

export function allTags() {
  const tags = new Set();
  projects.forEach(p => p.tags.forEach(t => tags.add(t)));
  return ["all", ...Array.from(tags).sort()];
}

// Dates in the manifest are written by hand ("2025-04-06", "05-24-2026", "n/a"); anything unreadable falls back to the year.
export function entryTime(p) {
  for (const raw of [p.date, p.year]) {
    const t = Date.parse(String(raw || "").replace(/^(\d\d)-(\d\d)-(\d{4})$/, "$3-$1-$2").replace(/-(\d)(?!\d)/g, "-0$1"));
    if (!Number.isNaN(t)) return t;
    const y = String(raw || "").match(/\d{4}/);
    if (y) return Date.UTC(+y[0], 0, 1);
  }
  return 0;
}

// Newest first, the order the board shows.
export function newestFirst(list = projects) {
  return [...list].sort((a, b) => entryTime(b) - entryTime(a));
}
