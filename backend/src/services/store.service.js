const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "jobs.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf-8");
}

function readJobs() {
  ensureFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8") || "[]");
}

function writeJobs(jobs) {
  ensureFile();
  // Escritura atómica: se escribe a un temporal y se renombra. Así un corte a
  // mitad de escritura nunca deja jobs.json truncado (rename es atómico).
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), "utf-8");
  fs.renameSync(tmp, DATA_FILE);
}

function createJob({ titulo, descripcion, requisitos }) {
  const jobs = readJobs();
  const job = {
    id: crypto.randomUUID(),
    titulo,
    descripcion,
    requisitos,
    cvs: [],
    creado: new Date().toISOString(),
  };
  jobs.push(job);
  writeJobs(jobs);
  return job;
}

function listJobs() {
  return readJobs();
}

function getJob(id) {
  return readJobs().find((j) => j.id === id) || null;
}

function addCv(jobId, cv) {
  const jobs = readJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return null;
  job.cvs.push(cv);
  writeJobs(jobs);
  return cv;
}

function updateCv(jobId, cvId, data) {
  const jobs = readJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return null;

  const cv = job.cvs.find((c) => c.id === cvId);
  if (!cv) return null;

  Object.assign(cv, data);
  writeJobs(jobs);
  return cv;
}

// Elimina una vacante por id. Devuelve la vacante borrada (con sus CVs, para
// poder limpiar los PDFs) o null si no existía.
function deleteJob(id) {
  const jobs = readJobs();
  const index = jobs.findIndex((j) => j.id === id);
  if (index === -1) return null;

  const [removed] = jobs.splice(index, 1);
  writeJobs(jobs);
  return removed;
}

// Elimina un CV de una vacante. Devuelve el CV borrado (con su `path`, para poder
// limpiar el PDF) o null si la vacante o el CV no existían.
function deleteCv(jobId, cvId) {
  const jobs = readJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return null;

  const index = job.cvs.findIndex((c) => c.id === cvId);
  if (index === -1) return null;

  const [removed] = job.cvs.splice(index, 1);
  writeJobs(jobs);
  return removed;
}

module.exports = { createJob, listJobs, getJob, addCv, updateCv, deleteJob, deleteCv };