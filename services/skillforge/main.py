
import asyncio
import base64
import hashlib
import os
import secrets
from contextlib import asynccontextmanager, suppress
from datetime import date
from html import escape
from pathlib import Path
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import delete, insert, select, update
from starlette.types import ASGIApp, Receive, Scope, Send

from . import config
from .career import router as career_router
from .db import attempts, digest, engine, now, profiles, provision, scans, session, sessions, touch
from .decision_context import explain
from .github import (
    CONTRIBUTION_LABELS,
    CONTRIBUTION_LANGUAGES,
    GitHubError,
    api,
    client,
    contribution_issues,
    public_repositories,
    read_source,
    repo_name,
)
from .migrate import migrate, require_current_schema
from .practice import router as practice_router
from .review import enabled as ai_enabled
from .sample import SNAPSHOT, SOURCES
from .scanning import compile_snapshot, run_scans, source_for
from .scoring import OPTIONAL, RUBRIC, finalize

WORKER_ENABLED = os.getenv("SCAN_WORKER_ENABLED", "true").lower() == "true"
DIST = config.ROOT / "apps" / "web" / "dist"
OAUTH_COOKIE = "__Host-skillforge-oauth" if config.PRODUCTION else "skillforge-oauth"


@asynccontextmanager
async def lifespan(_app):
    await asyncio.to_thread(require_current_schema if config.PRODUCTION else migrate)
    worker = asyncio.create_task(run_scans()) if WORKER_ENABLED else None
    try:
        yield
    finally:
        if worker:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class LimitMutationBody:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/") or scope["method"] in SAFE_METHODS:
            await self.app(scope, receive, send)
            return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > MAX_MUTATION_BYTES:
                await JSONResponse({"detail": "Request is too large."}, 413)(scope, receive, send)
                return
            body.extend(chunk)
            if not message.get("more_body"):
                break
        buffered = bytes(body)

        async def replay():
            nonlocal buffered
            if buffered is None:
                return await receive()
            message = {"type": "http.request", "body": buffered, "more_body": False}
            buffered = None
            return message

        await self.app(scope, replay, send)


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
MAX_MUTATION_BYTES = 64_000
app.add_middleware(LimitMutationBody)


@app.middleware("http")
async def boundaries(request, call_next):
    rejection = None
    if request.url.path.startswith("/api/") and request.method not in SAFE_METHODS:
        if request.headers.get("origin") != config.ORIGIN:
            rejection = JSONResponse({"detail": "Request origin could not be verified."}, 403)
        else:
            content_length = request.headers.get("content-length")
            if content_length and (
                not content_length.isdecimal() or len(content_length) > 5
                or int(content_length) > MAX_MUTATION_BYTES
            ):
                rejection = JSONResponse({"detail": "Request is too large."}, 413)
    response = rejection if rejection is not None else await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    is_api = request.url.path.startswith("/api/")
    if is_api:
        response.headers["Cache-Control"] = "no-store"
    if config.PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" if is_api else
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            "connect-src 'self'; script-src-attr 'none'; frame-src 'none'; frame-ancestors 'none'; "
            "object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
        )
    return response


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _exc):
    return JSONResponse({"detail": "Check the request fields and try again."}, 422)


@app.exception_handler(GitHubError)
async def github_failure(_request, exc):
    return JSONResponse({"detail": str(exc), "retryAt": exc.retry_at}, 429 if exc.retry_at else 502)


def write_cookie(response, token, github=False):
    response.set_cookie(config.COOKIE, token, httponly=True, secure=config.PRODUCTION,
                        samesite="lax", max_age=30 * 86400 if github else None, path="/")


def current_session(request):
    token = request.cookies.get(config.COOKIE)
    return session(token)


def owner_of(request):
    token = request.cookies.get(config.COOKIE)
    account = session(token)
    if not account:
        raise HTTPException(401, "Your workspace expired. Refresh to start a new session.")
    touch(token, account)
    return account["owner"]


@app.get("/api/health")
def health():
    with engine.connect() as connection:
        connection.execute(select(1))
    return {"ok": True}


@app.get("/api/session")
def workspace_session(request: Request, response: Response):
    token = request.cookies.get(config.COOKIE)
    account = session(token)
    if account:
        touch(token, account)
    else:
        write_cookie(response, provision())
    return {"login": account["github"] if account else None, "oauth": bool(
        config.GITHUB_CLIENT_ID and config.GITHUB_CLIENT_SECRET,
    ), "ai": ai_enabled(), "judge": bool(config.JUDGE_URL and config.JUDGE_TOKEN)}


@app.get("/api/auth/github")
def github_login():
    if not config.GITHUB_CLIENT_ID or not config.GITHUB_CLIENT_SECRET:
        return RedirectResponse("/?auth=unavailable")
    state, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    response = RedirectResponse("https://github.com/login/oauth/authorize?" + urlencode({
        "client_id": config.GITHUB_CLIENT_ID, "state": state, "redirect_uri": config.GITHUB_CALLBACK,
        "code_challenge": challenge, "code_challenge_method": "S256", "allow_signup": "true",
    }))
    response.set_cookie(OAUTH_COOKIE, state + "." + verifier, secure=config.PRODUCTION,
                        httponly=True, samesite="lax", max_age=600, path="/")
    return response


@app.get("/api/auth/github/callback")
async def github_callback(request: Request, code: str = "", state: str = ""):
    expected, _, verifier = request.cookies.get(OAUTH_COOKIE, "").partition(".")
    response = RedirectResponse("/?auth=failed")
    response.delete_cookie(OAUTH_COOKIE, path="/", secure=config.PRODUCTION, httponly=True)
    if not code or not expected or not secrets.compare_digest(expected, state) or not verifier:
        return response
    try:
        async with client() as http:
            exchange = await http.post("https://github.com/login/oauth/access_token", data={
                "client_id": config.GITHUB_CLIENT_ID, "client_secret": config.GITHUB_CLIENT_SECRET,
                "code": code, "redirect_uri": config.GITHUB_CALLBACK, "code_verifier": verifier,
            }, headers={"Accept": "application/json"})
            exchange.raise_for_status()
            token = exchange.json()["access_token"]
            user = await api(http, "/user", token=token, limit=64_000)
        owner = "github:" + str(int(user["id"]))
        if not isinstance(user["login"], str) or len(user["login"]) > 100:
            return response
        new = await asyncio.to_thread(provision, owner, user["login"], request.cookies.get(config.COOKIE))
        response.headers["location"] = "/?auth=connected"
        write_cookie(response, new, True)
    except (GitHubError, httpx.HTTPError, KeyError, TypeError, ValueError):
        pass
    return response


@app.post("/api/auth/logout")
def logout(request: Request):
    token = request.cookies.get(config.COOKIE)
    response = Response(status_code=204)
    write_cookie(response, provision(previous=token))
    return response


@app.delete("/api/account")
def erase_workspace(request: Request):
    owner = owner_of(request)
    with engine.begin() as connection:
        for table in (scans, attempts, profiles, sessions):
            connection.execute(delete(table).where(table.c.owner == owner))
    response = Response(status_code=204)
    write_cookie(response, provision())
    return response


@app.get("/api/github/repos")
async def list_github(request: Request, page: int = 1):
    account = current_session(request)
    if not account or not account["github"]:
        raise HTTPException(401, "Connect GitHub to browse your public repositories.")
    return await public_repositories(account["github"], min(10, max(1, page)))


class ImportRequest(BaseModel):
    repository: str = Field(min_length=3, max_length=280)
    ai: bool = False


class RubricApproval(BaseModel):
    expected: list[str] = Field(default_factory=list, max_length=len(OPTIONAL))
    note: str = Field(default="", max_length=600)


def scan_view(row, details=False):
    response = {key: row[key] for key in ("id", "repo", "state", "created", "updated")}
    if row["result"]:
        if row["state"] == "failed":
            response["result"] = row["result"]
            return response
        payload = row["result"]
        quality = payload["quality"]
        response["revision"] = payload["revision"]
        if row["state"] == "review":
            if details:
                preview = {key: value for key, value in quality.items() if key in (
                    "scale", "version", "archetype", "cohort", "coverage", "features",
                )}
                preview["criteria"] = [
                    {key: value for key, value in item.items() if key != "checks"} for item in quality["criteria"]
                ]
                response["result"] = {**payload, "quality": {**preview, "score": None, "rankable": False,
                                                              "dimensions": [], "findings": []}}
            return response
        response["summary"] = {key: quality[key] for key in (
            "score", "rankable", "cohort", "version", "coverage", "scale", "archetype", "grade", "comparisonKey",
        ) if key in quality}
        if details:
            response["result"] = payload
    return response


@app.post("/api/scans", status_code=202)
def start_scan(body: ImportRequest, request: Request):
    owner = owner_of(request)
    try:
        repository = repo_name(body.repository)
    except GitHubError as exc:
        raise HTTPException(422, str(exc)) from exc
    if body.ai and not ai_enabled():
        raise HTTPException(409, "AI review is unavailable. Start a static review instead.")
    with engine.begin() as connection:
        connection.execute(select(sessions.c.token).where(
            sessions.c.token == digest(request.cookies[config.COOKIE]),
        ).with_for_update()).first()
        active = connection.execute(select(scans).where(
            scans.c.owner == owner, scans.c.state.in_(["queued", "running"]),
        ).limit(4)).mappings().all()
        existing = next((row for row in active if row["repo"] == repository and row["options"]["ai"] == body.ai), None)
        if existing:
            return scan_view(existing)
        recent = connection.execute(select(scans.c.id).where(
            scans.c.owner == owner, scans.c.created >= now() - 3600,
        ).limit(12)).all()
        if len(active) >= 3 or len(recent) >= 12:
            raise HTTPException(429, "This workspace has reached its scan limit. Try again later.")
        row = {"id": str(uuid4()), "repo": repository, "owner": owner, "state": "queued",
               "created": now(), "updated": now(), "options": {"ai": body.ai}, "result": None}
        connection.execute(insert(scans).values(**row))
    return scan_view(row)


@app.get("/api/scans")
def list_scans(request: Request):
    owner = owner_of(request)
    with engine.connect() as connection:
        rows = connection.execute(select(scans).where(scans.c.owner == owner).order_by(
            scans.c.created.desc(), scans.c.id.desc(),
        ).limit(60)).mappings()
        return [scan_view(row) for row in rows]


def lookup(owner, scan_id):
    with engine.connect() as connection:
        row = connection.execute(select(scans).where(scans.c.id == scan_id, scans.c.owner == owner)).mappings().first()
    if not row:
        raise HTTPException(404, "This scan is unavailable in your workspace.")
    return row


@app.get("/api/scans/{scan_id}")
def scan_details(scan_id: str, request: Request):
    return scan_view(lookup(owner_of(request), scan_id), details=True)


@app.post("/api/scans/{scan_id}/rubric")
def publish_rubric(scan_id: str, body: RubricApproval, request: Request):
    owner = owner_of(request)
    row = lookup(owner, scan_id)
    if row["state"] == "complete":
        return scan_view(row, details=True)
    result = row["result"]
    if row["state"] != "review" or result["quality"]["version"] != RUBRIC:
        raise HTTPException(409, "This scan has no current rubric to approve.")
    possible = {choice["id"] for choice in result["quality"]["criteria"]
                if choice["relevance"] == "not_applicable"}
    expected = sorted(set(body.expected))
    if not set(expected).issubset(possible):
        raise HTTPException(422, "Only excluded criteria can be marked as expected capabilities.")
    updated = {**result, "quality": finalize(result["quality"], expected, body.note.strip())}
    with engine.begin() as connection:
        changed = connection.execute(update(scans).where(
            scans.c.owner == owner, scans.c.id == scan_id, scans.c.state == "review",
        ).values(state="complete", result=updated, updated=now()))
    if changed.rowcount != 1:
        return scan_view(lookup(owner, scan_id), details=True)
    return scan_view({**row, "state": "complete", "result": updated, "updated": now()}, details=True)


@app.delete("/api/scans/{scan_id}", status_code=204)
def delete_scan(scan_id: str, request: Request):
    owner = owner_of(request)
    with engine.begin() as connection:
        connection.execute(delete(scans).where(scans.c.owner == owner, scans.c.id == scan_id))
    return Response(status_code=204)


@app.get("/api/contributions")
async def contributions(request: Request, language: str, label: str, page: int = Query(1, ge=1, le=10)):
    owner_of(request)
    if language not in CONTRIBUTION_LANGUAGES or label not in CONTRIBUTION_LABELS:
        raise HTTPException(422, "Choose a supported language and issue label.")
    try:
        return await contribution_issues(language, label, page)
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "GitHub issue search is temporarily unavailable.") from exc


class ContextQuestion(BaseModel):
    question: str = Field(default="", max_length=200)
    path: str | None = Field(default=None, max_length=400)
    through: date | None = None
    neo4j: bool = False


async def context_for(snapshot, body):
    if not body.question.strip() and not body.path:
        raise HTTPException(422, "Enter a question or select a finding with a file.")
    if body.path and body.path not in snapshot["preview_paths"]:
        raise HTTPException(422, "This file is outside the analyzed source sample.")
    return await explain(snapshot, body.question, body.path, body.through.isoformat() if body.through else None,
                         body.neo4j)


@app.post("/api/scans/{scan_id}/context")
async def scan_context(scan_id: str, body: ContextQuestion, request: Request):
    row = lookup(owner_of(request), scan_id)
    if row["state"] not in {"complete", "review"}:
        raise HTTPException(409, "Context is available after indexing.")
    return await context_for(row["result"], body)


@app.post("/api/sample/context")
async def sample_context(body: ContextQuestion, request: Request):
    owner_of(request)
    return await context_for(compile_snapshot(SNAPSHOT), body)


@app.get("/api/scans/{scan_id}/source")
async def preview(scan_id: str, path: str, request: Request):
    row = lookup(owner_of(request), scan_id)
    result = row["result"]
    if row["state"] not in {"complete", "review"} or path not in result["preview_paths"]:
        raise HTTPException(404, "This file is outside the analyzed source sample.")
    async with client() as http:
        try:
            source = await read_source(http, row["repo"], result["revision"], path)
        except httpx.HTTPError as exc:
            raise HTTPException(502, "GitHub could not provide the selected file.") from exc
    return {"path": path, "source": source, "url": source_for(result, path)}


@app.get("/api/sample")
def sample():
    return compile_snapshot(SNAPSHOT)


@app.get("/api/sample/source")
def sample_source(path: str):
    if path not in SOURCES:
        raise HTTPException(404, "This file is outside the sample.")
    return {"path": path, "source": SOURCES[path], "url": None}


app.include_router(practice_router)
app.include_router(career_router)


if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.api_route("/robots.txt", methods=["GET", "HEAD"])
def robots():
    return PlainTextResponse(f"User-agent: *\nDisallow: /api/\nSitemap: {config.ORIGIN}/sitemap.xml\n")


@app.api_route("/sitemap.xml", methods=["GET", "HEAD"])
def sitemap():
    return Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{escape(config.ORIGIN)}/</loc></url>\n"
        "</urlset>\n",
        media_type="application/xml",
    )


@app.api_route("/share-card.png", methods=["GET", "HEAD"])
def share_card():
    image = DIST / "share-card.png"
    if not image.is_file():
        raise HTTPException(404, "Build the web application first.")
    return FileResponse(image, media_type="image/png")


@app.api_route("/", methods=["GET", "HEAD"])
def index():
    index_file = Path(DIST / "index.html")
    if not index_file.is_file():
        raise HTTPException(404, "Start the Vite development server or build the web application.")
    canonical = escape(config.ORIGIN + "/", quote=True)
    metadata = (
        f'<link rel="canonical" href="{canonical}">\n'
        f'<meta property="og:url" content="{canonical}">\n'
        f'<meta property="og:image" content="{canonical}share-card.png">\n'
        '<meta property="og:image:width" content="1200">\n'
        '<meta property="og:image:height" content="630">\n'
        '<meta property="og:image:alt" content="SkillForge repository graphs and engineering scorecards">'
    )
    return HTMLResponse(index_file.read_text(encoding="utf-8").replace("<!-- public-page-urls -->", metadata, 1))
