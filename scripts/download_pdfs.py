#!/usr/bin/env python3
"""
Descobre e baixa PDFs de um site WordPress (ex.: normadedesempenho.com.br).

Uso:
  python scripts/download_pdfs.py
  python scripts/download_pdfs.py --site normadedesempenho.com.br
  python scripts/download_pdfs.py --urls-file scripts/pdf-urls.txt
  python scripts/download_pdfs.py --discover-only

Dependencias: nenhuma (stdlib).
"""

from __future__ import annotations

import argparse
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from html.parser import HTMLParser
from pathlib import Path

USER_AGENT = "QiConhecimento-PdfDownloader/1.0 (+local research)"
DEFAULT_SITE = "normadedesempenho.com.br"
DEFAULT_UPLOADS = "/wp-content/uploads"
PDF_RE = re.compile(r"\.pdf(?:\?|#|$)", re.IGNORECASE)


class LinkExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        for key, value in attrs:
            if key.lower() == "href" and value:
                self.links.append(value.strip())


def normalize_url(href: str, base: str) -> str | None:
    href = href.strip()
    if not href or href.startswith(("#", "mailto:", "javascript:", "tel:")):
        return None
    if href.startswith("//"):
        return f"https:{href}"
    return urllib.parse.urljoin(base, href)


def host_matches(url: str, host: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        return host.lower() in (parsed.hostname or "").lower()
    except Exception:
        return False


def is_target_pdf(url: str, host: str, uploads_path: str) -> bool:
    if not PDF_RE.search(url):
        return False
    if not host_matches(url, host):
        return False
    path = urllib.parse.urlparse(url).path
    return uploads_path.lower() in path.lower()


def is_html_page(url: str) -> bool:
    path = urllib.parse.urlparse(url).path.lower()
    if PDF_RE.search(path):
        return False
    skip_ext = (
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".zip",
        ".rar",
        ".css",
        ".js",
        ".xml",
        ".svg",
        ".mp4",
        ".woff",
        ".woff2",
    )
    return not any(path.endswith(ext) for ext in skip_ext)


def fetch_text(url: str, timeout: int) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "html" not in content_type and "text" not in content_type:
                return None
            raw = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="replace")
    except Exception:
        return None


def extract_links(html: str, page_url: str) -> list[str]:
    parser = LinkExtractor()
    parser.feed(html)
    out: list[str] = []
    for href in parser.links:
        abs_url = normalize_url(href, page_url)
        if abs_url:
            out.append(abs_url)
    # URLs soltas no HTML (embeds, scripts, etc.)
    for match in re.findall(r'https?://[^\s"\'<>]+\.pdf[^\s"\'<>]*', html, flags=re.I):
        out.append(match.rstrip(".,);]"))
    return out


def discover_pdfs(
    host: str,
    uploads_path: str,
    max_pages: int,
    delay: float,
    timeout: int,
) -> list[str]:
    seeds = [
        f"https://www.{host}/",
        f"https://{host}/",
    ]
    queue: deque[str] = deque(seeds)
    visited: set[str] = set()
    pdfs: set[str] = set()

    print(f"Descobrindo PDFs em {host} (ate {max_pages} paginas)...")

    while queue and len(visited) < max_pages:
        page_url = queue.popleft()
        if page_url in visited:
            continue
        visited.add(page_url)

        print(f"  [{len(visited)}/{max_pages}] {page_url}")

        html = fetch_text(page_url, timeout)
        if not html:
            time.sleep(delay)
            continue

        for link in extract_links(html, page_url):
            if is_target_pdf(link, host, uploads_path):
                pdfs.add(link.split("#")[0])
                continue
            if host_matches(link, host) and is_html_page(link):
                clean = link.split("#")[0]
                if clean not in visited:
                    queue.append(clean)

        time.sleep(delay)

    return sorted(pdfs)


def load_urls_file(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    urls: list[str] = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        urls.append(line.split("#")[0].strip())
    return urls


def safe_filename(url: str) -> str:
    path = urllib.parse.urlparse(url).path
    name = Path(path).name or "documento.pdf"
    return re.sub(r'[<>:"/\\|?*]', "_", name)


def download_pdf(url: str, dest: Path, timeout: int, retries: int) -> str:
    if dest.exists() and dest.stat().st_size > 0:
        return "skipped"

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
            if len(data) < 100:
                raise ValueError("arquivo muito pequeno")
            dest.write_bytes(data)
            return "ok"
        except Exception as exc:
            if attempt == retries:
                print(f"    FALHOU: {exc}")
                if dest.exists():
                    dest.unlink(missing_ok=True)
                return "failed"
            time.sleep(attempt * 2)
    return "failed"


def unique_dest(out_dir: Path, url: str) -> Path:
    base = safe_filename(url)
    dest = out_dir / base
    if not dest.exists():
        return dest
    stem = dest.stem
    suffix = dest.suffix
    n = 2
    while True:
        candidate = out_dir / f"{stem}_{n}{suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Descobre e baixa PDFs de um site WordPress.")
    parser.add_argument("--site", default=DEFAULT_SITE, help="Dominio (sem https)")
    parser.add_argument("--uploads-path", default=DEFAULT_UPLOADS, help="Filtro de caminho")
    parser.add_argument(
        "--out-dir",
        default="pdf-downloads/normadedesempenho",
        help="Pasta de destino",
    )
    parser.add_argument("--urls-file", help="Arquivo com URLs extras (uma por linha)")
    parser.add_argument("--max-pages", type=int, default=250, help="Max paginas HTML no crawl")
    parser.add_argument("--delay", type=float, default=0.4, help="Segundos entre requests")
    parser.add_argument("--timeout", type=int, default=120, help="Timeout HTTP (s)")
    parser.add_argument("--retries", type=int, default=3, help="Tentativas por download")
    parser.add_argument(
        "--discover-only",
        action="store_true",
        help="So lista URLs, nao baixa",
    )
    parser.add_argument(
        "--no-discover",
        action="store_true",
        help="So usa --urls-file (sem crawl)",
    )
    args = parser.parse_args()

    host = args.site.removeprefix("https://").removeprefix("http://").strip("/")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pdf_urls: set[str] = set()

    if not args.no_discover:
        found = discover_pdfs(
            host=host,
            uploads_path=args.uploads_path,
            max_pages=args.max_pages,
            delay=args.delay,
            timeout=args.timeout,
        )
        pdf_urls.update(found)

    if args.urls_file:
        extra = load_urls_file(Path(args.urls_file))
        pdf_urls.update(u for u in extra if PDF_RE.search(u))

    pdf_list = sorted(pdf_urls)
    manifest = out_dir / "_urls.txt"
    manifest.write_text("\n".join(pdf_list) + ("\n" if pdf_list else ""), encoding="utf-8")

    print(f"\n{len(pdf_list)} PDF(s) encontrado(s). Lista: {manifest}")

    if args.discover_only:
        for url in pdf_list:
            print(url)
        return 0 if pdf_list else 1

    if not pdf_list:
        print("Nenhum PDF encontrado.")
        return 1

    ok = skipped = failed = 0
    print(f"\nBaixando para {out_dir.resolve()}\n")

    for i, url in enumerate(pdf_list, 1):
        dest = unique_dest(out_dir, url)
        print(f"[{i}/{len(pdf_list)}] {url}")
        result = download_pdf(url, dest, args.timeout, args.retries)
        if result == "ok":
            kb = dest.stat().st_size / 1024
            print(f"    -> {dest.name} ({kb:.1f} KB)")
            ok += 1
        elif result == "skipped":
            print(f"    -> ja existe: {dest.name}")
            skipped += 1
        else:
            failed += 1
        time.sleep(args.delay)

    print(f"\nConcluido: {ok} baixados, {skipped} ignorados, {failed} falhas.")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
