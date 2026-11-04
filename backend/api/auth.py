import os
from fastapi import HTTPException, Request

API_KEY_HEADER = "X-API-KEY"


def require_api_key(request: Request) -> bool:
    """
    FastAPI dependency that validates the X-API-KEY header against ARVS_API_KEY.
    If ARVS_API_KEY is not set or empty, access is unrestricted (dev mode / local UI).
    If ARVS_API_KEY is configured, requests must supply a matching X-API-KEY header.
    """
    expected = os.getenv("ARVS_API_KEY", "").strip()
    if not expected:
        return True

    provided = request.headers.get(API_KEY_HEADER)
    if not provided or provided != expected:
        raise HTTPException(
            status_code=403,
            detail="Invalid or missing API key. Please provide a valid 'X-API-KEY' header."
        )
    return True

