"""Create a source-only private handoff without development state or credentials."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib

root = Path(__file__).resolve().parents[1]
output = root / "artifacts" / "maktabati-v0.1.0-source.zip"
directories = {"src", "worker", "public", "migrations", "scripts", "tests", "docs", "packaging"}
files = {".gitignore", ".dev.vars.example", "package.json", "package-lock.json", "README.md",
         "vite.config.ts", "tsconfig.json", "playwright.config.ts", "index.html", "wrangler.jsonc"}
blocked_dirs = {".git", ".wrangler", "node_modules", "dist", "test-results", "playwright-report",
                "target", "gen", "artifacts", "__pycache__", ".gradle", ".idea"}
blocked_suffixes = {".db", ".sqlite", ".sqlite3", ".jks", ".keystore", ".pfx", ".p12", ".pem", ".key", ".log", ".pyc", ".exe", ".apk", ".aab", ".zip"}

def allowed(path):
    rel = path.relative_to(root)
    if path.is_symlink() or any(part in blocked_dirs for part in rel.parts):
        return False
    if rel.parts[0] not in directories and str(rel) not in files:
        return False
    if path.name in {"keystore.properties", "local.properties", "release-config.json"}:
        return False
    if path.name != ".dev.vars.example" and (path.name.startswith(".dev.vars") or path.name.startswith(".env")):
        return False
    return path.suffix.lower() not in blocked_suffixes and not path.name.endswith(("-wal", "-shm", "-journal"))

def candidates(directory):
    for path in sorted(directory.iterdir()):
        if path.is_symlink() or path.name in blocked_dirs:
            continue
        if path.is_dir():
            if directory != root or path.name in directories:
                yield from candidates(path)
        elif allowed(path):
            yield path

output.parent.mkdir(exist_ok=True)
entries = list(candidates(root))
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for path in entries:
        archive.write(path, "maktabati/" + path.relative_to(root).as_posix())
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert "maktabati/.dev.vars.example" in archive.namelist()
    assert "maktabati/package-lock.json" in archive.namelist()
    assert "maktabati/packaging/package-lock.json" in archive.namelist()
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix(".zip.sha256").write_text(digest + "  " + output.name + "\n", encoding="utf-8")
print(f"Created {output} ({len(entries)} source files); SHA256 {digest}")
