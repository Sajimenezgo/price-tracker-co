"""Cliente HTTP resiliente: reintentos con backoff exponencial, jitter y rotación de headers."""
import logging
import random
import time

import requests

from . import config

log = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
]
ACCEPT_LANGS = ["es-CO,es;q=0.9,en;q=0.7", "es-419,es;q=0.9", "es-CO,es;q=0.8,en-US;q=0.6"]
RETRY_STATUS = {408, 425, 429, 500, 502, 503, 504, 520, 522, 524}


def random_headers(accept: str = "application/json, text/plain, */*", referer: str | None = None) -> dict:
    h = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": accept,
        "Accept-Language": random.choice(ACCEPT_LANGS),
        "Cache-Control": "no-cache",
    }
    if referer:
        h["Referer"] = referer
    return h


class ResilientClient:
    def __init__(self, referer: str | None = None):
        self.session = requests.Session()
        self.referer = referer

    def _sleep_polite(self):
        time.sleep(random.uniform(config.MIN_DELAY, config.MAX_DELAY))

    def get(self, url: str, params: dict | None = None, accept: str = "application/json, text/plain, */*") -> requests.Response:
        """GET con reintentos. Lanza la última excepción si se agotan los intentos."""
        last_exc: Exception | None = None
        for attempt in range(config.MAX_RETRIES):
            try:
                resp = self.session.get(
                    url, params=params, timeout=config.REQUEST_TIMEOUT,
                    headers=random_headers(accept, self.referer), allow_redirects=True,
                )
                if resp.status_code in RETRY_STATUS:
                    raise requests.HTTPError(f"HTTP {resp.status_code}", response=resp)
                # VTEX responde 206 (Partial Content) en búsquedas paginadas: es válido.
                if resp.status_code >= 400:
                    resp.raise_for_status()
                self._sleep_polite()
                return resp
            except requests.RequestException as exc:
                last_exc = exc
                status = getattr(getattr(exc, "response", None), "status_code", None)
                if status is not None and 400 <= status < 500 and status not in RETRY_STATUS:
                    raise  # error permanente (404, 400...): no tiene sentido reintentar
                wait = config.BACKOFF_BASE * (2 ** attempt) + random.uniform(0, 1)
                log.warning("Intento %d/%d falló (%s). Reintento en %.1fs", attempt + 1, config.MAX_RETRIES, exc, wait)
                time.sleep(wait)
                self.session.cookies.clear()  # nueva "identidad" en el siguiente intento
        assert last_exc is not None
        raise last_exc
