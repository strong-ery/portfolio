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
