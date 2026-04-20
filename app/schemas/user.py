"""
Pydantic schemas for User.
"""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ── Shared fields ────────────────────────────────────────────────
class UserBase(BaseModel):
    """Fields common to create and read operations."""

    email: str = Field(..., max_length=255, examples=["alice@microgrid.io"])
    full_name: str = Field(..., max_length=255, examples=["Alice Johnson"])
    role: str = Field(
        default="viewer",
        pattern="^(admin|prosumer|analyst|viewer)$",
        examples=["prosumer"],
    )


# ── Create ───────────────────────────────────────────────────────
class UserCreate(UserBase):
    """Payload for creating a new user."""

    password: str = Field(..., min_length=8, max_length=128)


# ── Update ───────────────────────────────────────────────────────
class UserUpdate(BaseModel):
    """Payload for updating an existing user. All fields optional."""

    email: str | None = Field(default=None, max_length=255)
    full_name: str | None = Field(default=None, max_length=255)
    role: str | None = Field(
        default=None, pattern="^(admin|prosumer|analyst|viewer)$"
    )
    is_active: bool | None = None


# ── Response ─────────────────────────────────────────────────────
class UserResponse(UserBase):
    """User data returned to the client (never includes password)."""

    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
