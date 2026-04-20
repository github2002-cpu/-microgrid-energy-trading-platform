"""
API v1 router for User endpoints.

Placeholder — actual CRUD will be implemented in a later step.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", summary="List all users")
async def list_users():
    """Return all users. Full implementation coming in Step 2."""
    return {"message": "User listing endpoint — not yet implemented"}


@router.get("/{user_id}", summary="Get user by ID")
async def get_user(user_id: str):
    """Return a single user. Full implementation coming in Step 2."""
    return {"message": f"User detail endpoint for {user_id} — not yet implemented"}
