"use client";

import { createAuthClient } from "better-auth/react";

/** Browser auth client (same-origin; the base URL is inferred from the current page). */
export const authClient = createAuthClient();
