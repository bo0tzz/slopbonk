import type { Reviewer } from '#lib/server/auth/session.js';

declare global {
	namespace App {
		interface Locals {
			reviewer: Reviewer | null;
		}
	}
}

export {};
