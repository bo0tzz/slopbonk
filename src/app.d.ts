import type { Reviewer } from '$lib/server/auth/session';

declare global {
	namespace App {
		interface Locals {
			reviewer: Reviewer | null;
		}
	}
}

export {};
