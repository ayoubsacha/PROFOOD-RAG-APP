import jwt

from fastapi import Header, HTTPException
from jwt import ExpiredSignatureError, InvalidTokenError

from app.config import settings


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header",
        )

    token = authorization.replace("Bearer ", "").strip()

    if not settings.jwt_secret:
        raise HTTPException(
            status_code=500,
            detail="JWT_SECRET is missing in FastAPI .env",
        )

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
        )

        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Token does not contain user id",
            )

        return {
            "user_id": user_id,
            "email": payload.get("email"),
            "role": payload.get("role"),
            "name": payload.get("name"),
        }

    except ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token expired",
        )

    except InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )